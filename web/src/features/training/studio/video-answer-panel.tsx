/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import {
  Camera,
  CircleAlert,
  CircleCheck,
  LoaderCircle,
  Play,
  RotateCcw,
  Send,
  Square,
  Trash2,
  Video,
} from 'lucide-react'
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

import type {
  TrainingRoomMediaControlHandle,
  TrainingRoomPrimaryActionState,
} from './training-room-media-control'
import {
  loadVideoAnswerReplay,
  persistVideoAnswerMessage,
  uploadVideoAnswer,
  VIDEO_ANSWER_MAX_BYTES,
  VIDEO_ANSWER_MAX_CAPTION_LENGTH,
  VIDEO_ANSWER_MAX_DURATION_MS,
  type PersistedVideoAnswerMessage,
  type RecordedVideoAnswer,
  type UploadedVideoAnswer,
  type VideoAnswerFeedbackMode,
} from './video-answer-client'

type VideoAnswerStatus =
  | 'idle'
  | 'persisting'
  | 'ready'
  | 'recorded'
  | 'recording'
  | 'requesting'
  | 'submitted'
  | 'uploading'

interface VideoAnswerPanelProps {
  readonly apiBase: string
  readonly disabled?: boolean
  readonly feedbackMode: VideoAnswerFeedbackMode
  readonly maxDurationMs?: number
  readonly onPrimaryActionChange?: (
    action: TrainingRoomPrimaryActionState | null
  ) => void
  readonly onPersisted?: (message: PersistedVideoAnswerMessage) => void
  readonly roomId: string
  readonly sessionId: string
  readonly showPrimaryAction?: boolean
}

const MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
] as const

function supportedMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  return (
    MIME_CANDIDATES.find((candidate) =>
      MediaRecorder.isTypeSupported(candidate)
    ) ?? null
  )
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function isPermissionError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError')
  )
}

function statusVariant(
  status: VideoAnswerStatus,
  hasError: boolean
): 'destructive' | 'outline' | 'secondary' {
  if (hasError) return 'destructive'
  if (
    status === 'persisting' ||
    status === 'recording' ||
    status === 'requesting' ||
    status === 'uploading'
  ) {
    return 'secondary'
  }
  return 'outline'
}

export const VideoAnswerPanel = forwardRef<
  TrainingRoomMediaControlHandle,
  VideoAnswerPanelProps
>(function VideoAnswerPanel(
  {
    apiBase,
    disabled = false,
    feedbackMode,
    maxDurationMs = 3 * 60 * 1000,
    onPrimaryActionChange,
    onPersisted,
    roomId,
    sessionId,
    showPrimaryAction = true,
  },
  ref
) {
  const { i18n, t } = useTranslation()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const startedAtRef = useRef(0)
  const generationRef = useRef(0)
  const localPreviewUrlRef = useRef<string | null>(null)
  const serverPreviewUrlRef = useRef<string | null>(null)
  const uploadedRef = useRef<UploadedVideoAnswer | null>(null)
  const [caption, setCaption] = useState('')
  const [elapsedMs, setElapsedMs] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [playbackError, setPlaybackError] = useState<string | null>(null)
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null)
  const [serverPreviewUrl, setServerPreviewUrl] = useState<string | null>(null)
  const [recording, setRecording] = useState<RecordedVideoAnswer | null>(null)
  const [status, setStatus] = useState<VideoAnswerStatus>('idle')
  const localize = useCallback(
    (english: string, chinese: string) =>
      t(english, {
        defaultValue: i18n.language.startsWith('zh') ? chinese : english,
      }),
    [i18n.language, t]
  )
  const mimeType = useMemo(supportedMimeType, [])
  const recordingLimit = Math.min(
    VIDEO_ANSWER_MAX_DURATION_MS,
    Math.max(1000, maxDurationMs)
  )

  const revokeLocalPreview = useCallback(() => {
    if (localPreviewUrlRef.current) {
      URL.revokeObjectURL(localPreviewUrlRef.current)
      localPreviewUrlRef.current = null
    }
    setLocalPreviewUrl(null)
  }, [])

  const revokeServerPreview = useCallback(() => {
    if (serverPreviewUrlRef.current) {
      URL.revokeObjectURL(serverPreviewUrlRef.current)
      serverPreviewUrlRef.current = null
    }
    setServerPreviewUrl(null)
  }, [])

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  const discard = useCallback(() => {
    generationRef.current += 1
    const recorder = recorderRef.current
    recorderRef.current = null
    if (recorder && recorder.state !== 'inactive') recorder.stop()
    releaseStream()
    revokeLocalPreview()
    revokeServerPreview()
    chunksRef.current = []
    uploadedRef.current = null
    setCaption('')
    setElapsedMs(0)
    setError(null)
    setPlaybackError(null)
    setRecording(null)
    setStatus('idle')
  }, [releaseStream, revokeLocalPreview, revokeServerPreview])

  useEffect(
    () => () => {
      generationRef.current += 1
      const recorder = recorderRef.current
      recorderRef.current = null
      if (recorder && recorder.state !== 'inactive') recorder.stop()
      releaseStream()
      if (localPreviewUrlRef.current) {
        URL.revokeObjectURL(localPreviewUrlRef.current)
      }
      if (serverPreviewUrlRef.current) {
        URL.revokeObjectURL(serverPreviewUrlRef.current)
      }
    },
    [releaseStream]
  )

  useEffect(() => {
    if (status !== 'recording') return undefined
    const timer = window.setInterval(() => {
      const nextElapsed = Date.now() - startedAtRef.current
      setElapsedMs(nextElapsed)
      if (nextElapsed >= recordingLimit) {
        const recorder = recorderRef.current
        if (recorder && recorder.state !== 'inactive') recorder.stop()
      }
    }, 250)
    return () => window.clearInterval(timer)
  }, [recordingLimit, status])

  useEffect(() => {
    if (status !== 'ready' && status !== 'recording') return
    const element = videoRef.current
    const stream = streamRef.current
    if (!element || !stream) return
    element.srcObject = stream
    element.muted = true
    void element.play().catch(() => undefined)
  }, [status])

  const enableCamera = useCallback(async () => {
    if (disabled || status === 'requesting') return
    setError(null)
    setPlaybackError(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        localize(
          'Camera capture is unavailable in this browser.',
          '当前浏览器无法使用摄像头录制。'
        )
      )
      return
    }
    if (!mimeType) {
      setError(
        localize(
          'This browser cannot record a supported video format.',
          '当前浏览器无法录制受支持的视频格式。'
        )
      )
      return
    }

    setStatus('requesting')
    generationRef.current += 1
    const generation = generationRef.current
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
        },
        video: { facingMode: 'user' },
      })
      if (generation !== generationRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.muted = true
        await videoRef.current.play().catch(() => undefined)
      }
      setStatus('ready')
    } catch (nextError) {
      releaseStream()
      setStatus('idle')
      let message = localize(
        'Camera and microphone could not be opened.',
        '无法打开摄像头和麦克风。'
      )
      if (isPermissionError(nextError)) {
        message = localize(
          'Camera or microphone permission was not granted.',
          '未获得摄像头或麦克风权限。'
        )
      } else if (nextError instanceof Error) {
        message = nextError.message
      }
      setError(message)
    }
  }, [disabled, localize, mimeType, releaseStream, status])

  const startRecording = useCallback(() => {
    const stream = streamRef.current
    if (disabled || !stream || !mimeType || status !== 'ready') return
    setError(null)
    setPlaybackError(null)
    revokeLocalPreview()
    revokeServerPreview()
    setRecording(null)
    uploadedRef.current = null
    chunksRef.current = []
    generationRef.current += 1
    const generation = generationRef.current

    try {
      const recorder = new MediaRecorder(stream, { mimeType })
      recorderRef.current = recorder
      recorder.addEventListener('dataavailable', (event) => {
        if (generation === generationRef.current && event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      })
      recorder.addEventListener('error', () => {
        if (generation !== generationRef.current) return
        generationRef.current += 1
        recorderRef.current = null
        releaseStream()
        setStatus('idle')
        setError(
          localize(
            'Video recording stopped unexpectedly.',
            '视频录制意外中断。'
          )
        )
      })
      recorder.addEventListener('stop', () => {
        if (generation !== generationRef.current) return
        recorderRef.current = null
        const durationMs = Math.min(
          VIDEO_ANSWER_MAX_DURATION_MS,
          Math.max(0, Date.now() - startedAtRef.current)
        )
        const finalMimeType = recorder.mimeType || mimeType
        const blob = new Blob(chunksRef.current, { type: finalMimeType })
        chunksRef.current = []
        releaseStream()
        if (blob.size === 0 || blob.size > VIDEO_ANSWER_MAX_BYTES) {
          setStatus('idle')
          setError(
            blob.size === 0
              ? localize(
                  'The recording did not contain video data.',
                  '录制结果不包含视频数据。'
                )
              : localize(
                  'The recording exceeds the 100 MB upload limit.',
                  '录制结果超过 100 MB 上传限制。'
                )
          )
          return
        }
        const nextRecording: RecordedVideoAnswer = {
          blob,
          durationMs,
          mimeType: finalMimeType,
          recordedAt: new Date().toISOString(),
        }
        const previewUrl = URL.createObjectURL(blob)
        localPreviewUrlRef.current = previewUrl
        setLocalPreviewUrl(previewUrl)
        setRecording(nextRecording)
        setElapsedMs(durationMs)
        setStatus('recorded')
      })
      startedAtRef.current = Date.now()
      setElapsedMs(0)
      recorder.start(250)
      setStatus('recording')
    } catch (nextError) {
      recorderRef.current = null
      releaseStream()
      setStatus('idle')
      setError(
        nextError instanceof Error
          ? nextError.message
          : localize(
              'Video recording could not be started.',
              '无法开始视频录制。'
            )
      )
    }
  }, [
    disabled,
    localize,
    mimeType,
    releaseStream,
    revokeLocalPreview,
    revokeServerPreview,
    status,
  ])

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') recorder.stop()
  }, [])

  const submitRecording = useCallback(async () => {
    if (!recording || disabled) return
    setError(null)
    setPlaybackError(null)
    let uploaded = uploadedRef.current
    try {
      if (!uploaded) {
        setStatus('uploading')
        uploaded = await uploadVideoAnswer({
          apiBase,
          feedbackMode,
          recording,
          roomId,
          trainingSessionId: sessionId,
        })
        uploadedRef.current = uploaded
      }

      setStatus('persisting')
      const persisted = await persistVideoAnswerMessage({
        apiBase,
        attachment: uploaded,
        caption,
        feedbackMode,
        roomId,
        trainingSessionId: sessionId,
      })
      setStatus('submitted')
      try {
        onPersisted?.(persisted)
      } catch {
        // A consumer callback cannot roll back a server-confirmed message.
      }

      try {
        const replay = await loadVideoAnswerReplay(
          uploaded,
          { roomId, trainingSessionId: sessionId },
          apiBase
        )
        revokeServerPreview()
        const replayUrl = URL.createObjectURL(replay)
        serverPreviewUrlRef.current = replayUrl
        setServerPreviewUrl(replayUrl)
      } catch (nextError) {
        setPlaybackError(
          nextError instanceof Error
            ? nextError.message
            : localize(
                'The saved video could not be loaded for replay.',
                '已保存的视频暂时无法回放。'
              )
        )
      }
    } catch (nextError) {
      setStatus('recorded')
      setError(
        nextError instanceof Error
          ? nextError.message
          : localize(
              'The video answer could not be saved.',
              '视频回答无法保存。'
            )
      )
    }
  }, [
    apiBase,
    caption,
    disabled,
    feedbackMode,
    localize,
    onPersisted,
    recording,
    revokeServerPreview,
    roomId,
    sessionId,
  ])

  const busy =
    status === 'persisting' || status === 'requesting' || status === 'uploading'
  const statusLabels: Record<VideoAnswerStatus, string> = {
    idle: localize('Camera off', '摄像头未开启'),
    persisting: localize('Saving message', '正在保存消息'),
    ready: localize('Camera and microphone ready', '摄像头和麦克风已就绪'),
    recorded: uploadedRef.current
      ? localize('Upload ready to retry', '上传完成，可重试保存')
      : localize('Recording ready', '录制已就绪'),
    recording: localize('Recording', '正在录制'),
    requesting: localize('Requesting access', '正在请求权限'),
    submitted: localize('Saved', '已保存'),
    uploading: localize('Uploading', '正在上传'),
  }
  let actionIcon: TrainingRoomPrimaryActionState['icon'] = 'camera'
  let actionLabel = localize('Enable camera', '开启摄像头')
  let actionTone: TrainingRoomPrimaryActionState['tone'] = 'default'
  if (status === 'ready') {
    actionIcon = 'play'
    actionLabel = localize('Record', '开始录制')
  } else if (status === 'recording') {
    actionIcon = 'square'
    actionLabel = localize('Stop', '停止')
    actionTone = 'destructive'
  } else if (status === 'recorded') {
    actionIcon = 'send'
    actionLabel = uploadedRef.current
      ? localize('Retry save', '重试保存')
      : localize('Submit', '提交')
  } else if (busy) {
    actionIcon = 'loader'
    actionLabel = statusLabels[status]
  } else if (status === 'submitted') {
    actionIcon = 'rotate'
    actionLabel = localize('Record another', '继续录制')
  }

  useImperativeHandle(
    ref,
    () => ({
      trigger() {
        if (status === 'idle') void enableCamera()
        else if (status === 'ready') startRecording()
        else if (status === 'recording') stopRecording()
        else if (status === 'recorded') void submitRecording()
        else if (status === 'submitted') discard()
      },
    }),
    [
      discard,
      enableCamera,
      startRecording,
      status,
      stopRecording,
      submitRecording,
    ]
  )

  useEffect(() => {
    onPrimaryActionChange?.({
      active: status === 'recording',
      disabled: disabled || busy || !mimeType,
      icon: actionIcon,
      label: actionLabel,
      title: error || actionLabel,
      tone: actionTone,
    })
  }, [
    actionIcon,
    actionLabel,
    actionTone,
    busy,
    disabled,
    error,
    mimeType,
    onPrimaryActionChange,
    status,
  ])

  useEffect(() => () => onPrimaryActionChange?.(null), [onPrimaryActionChange])

  const displayUrl = status === 'submitted' ? serverPreviewUrl : localPreviewUrl
  const showingLivePreview = status === 'ready' || status === 'recording'

  return (
    <section
      className='border-border space-y-4 border-t pt-4'
      aria-live='polite'
    >
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='flex min-w-0 flex-wrap items-center gap-2'>
          <Video className='text-muted-foreground size-4' />
          <h2 className='text-sm font-semibold'>
            {localize('Video answer', '视频回答')}
          </h2>
          <Badge variant={statusVariant(status, Boolean(error))}>
            {statusLabels[status]}
          </Badge>
          {(status === 'recording' || recording) && (
            <Badge variant='outline'>{formatDuration(elapsedMs)}</Badge>
          )}
        </div>

        <div className='flex flex-wrap items-center justify-end gap-2'>
          {showPrimaryAction && status === 'idle' && (
            <Button
              type='button'
              size='sm'
              variant='outline'
              onClick={enableCamera}
              disabled={disabled}
            >
              <Camera />
              {localize('Enable camera', '开启摄像头')}
            </Button>
          )}
          {showPrimaryAction && status === 'ready' && (
            <Button
              type='button'
              size='sm'
              onClick={startRecording}
              disabled={disabled}
            >
              <Play />
              {localize('Record', '开始录制')}
            </Button>
          )}
          {showPrimaryAction && status === 'recording' && (
            <Button
              type='button'
              size='sm'
              variant='destructive'
              onClick={stopRecording}
              disabled={disabled}
            >
              <Square />
              {localize('Stop', '停止')}
            </Button>
          )}
          {showPrimaryAction && status === 'recorded' && (
            <Button
              type='button'
              size='sm'
              onClick={submitRecording}
              disabled={disabled}
            >
              <Send />
              {uploadedRef.current
                ? localize('Retry save', '重试保存')
                : localize('Submit', '提交')}
            </Button>
          )}
          {showPrimaryAction && busy && (
            <Button type='button' size='sm' disabled>
              <LoaderCircle className='animate-spin' />
              {statusLabels[status]}
            </Button>
          )}
          {showPrimaryAction && status === 'submitted' && (
            <Button
              type='button'
              size='sm'
              variant='outline'
              onClick={discard}
              disabled={disabled}
            >
              <RotateCcw />
              {localize('Record another', '继续录制')}
            </Button>
          )}
          {(status === 'ready' ||
            status === 'recorded' ||
            status === 'recording') && (
            <Button
              type='button'
              size='icon-sm'
              variant='ghost'
              onClick={discard}
              disabled={busy}
              aria-label={localize('Discard recording', '丢弃录制')}
              title={localize('Discard recording', '丢弃录制')}
            >
              <Trash2 />
            </Button>
          )}
        </div>
      </div>

      <div className='bg-muted relative aspect-video w-full overflow-hidden rounded-md border'>
        {displayUrl && (
          <video
            ref={videoRef}
            src={displayUrl}
            className='size-full object-contain'
            controls
            playsInline
          />
        )}
        {!displayUrl && showingLivePreview && (
          <video
            ref={videoRef}
            className='size-full object-contain'
            autoPlay
            muted
            playsInline
          />
        )}
        {!displayUrl && !showingLivePreview && (
          <div className='text-muted-foreground flex size-full items-center justify-center'>
            <Camera className='size-8' />
          </div>
        )}
      </div>

      {recording && status !== 'submitted' && (
        <div className='space-y-2'>
          <Label htmlFor={`video-answer-caption-${sessionId}`}>
            {localize('Answer caption', '回答说明')}
          </Label>
          <Textarea
            id={`video-answer-caption-${sessionId}`}
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            maxLength={VIDEO_ANSWER_MAX_CAPTION_LENGTH}
            disabled={busy || disabled}
            placeholder={localize(
              'Add context for this answer',
              '补充这段回答的上下文'
            )}
          />
        </div>
      )}

      {status === 'submitted' && !playbackError && (
        <Alert>
          <CircleCheck />
          <AlertTitle>{localize('Answer saved', '回答已保存')}</AlertTitle>
          <AlertDescription>
            {localize(
              'The uploaded recording is attached to this training conversation.',
              '上传的视频已关联到当前训练对话。'
            )}
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant='destructive'>
          <CircleAlert />
          <AlertTitle>
            {uploadedRef.current
              ? localize('Message not saved', '消息未保存')
              : localize('Video answer not saved', '视频回答未保存')}
          </AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {playbackError && (
        <Alert variant='destructive'>
          <CircleAlert />
          <AlertTitle>
            {localize('Saved replay unavailable', '已保存视频无法回放')}
          </AlertTitle>
          <AlertDescription>{playbackError}</AlertDescription>
        </Alert>
      )}
    </section>
  )
})
