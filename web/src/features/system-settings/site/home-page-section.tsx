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

import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm, type FieldPath, type UseFormReturn } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import * as z from 'zod'

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  DEFAULT_HOME_PAGE_CONFIG,
  HOME_PAGE_CONFIG_OPTION,
  HOME_PAGE_LANGUAGE_CODES,
  parseHomePageConfig,
  serializeHomePageConfig,
  type HomePageConfig,
  type HomePageLocaleConfig,
} from '@/features/home/config'
import {
  INTERFACE_LANGUAGE_OPTIONS,
  normalizeInterfaceLanguage,
  type InterfaceLanguageCode,
} from '@/i18n/languages'

import {
  SettingsForm,
  SettingsFormGrid,
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

const heroSchema = z.object({
  badge: z.string(),
  title: z.string(),
  highlightedTitle: z.string(),
  description: z.string(),
  supportEyebrow: z.string(),
  supportDescription: z.string(),
})

const ctaSchema = z.object({
  titleFirst: z.string(),
  titleSecond: z.string(),
  description: z.string(),
  actionLabel: z.string(),
})

const localeSchema = z.object({
  hero: heroSchema,
  cta: ctaSchema,
})

const homePageSchema = z.object({
  sections: z.object({
    stats: z.boolean(),
    features: z.boolean(),
    workflow: z.boolean(),
    cta: z.boolean(),
    scenarioSupport: z.boolean(),
  }),
  locales: z.object({
    en: localeSchema,
    zhCN: localeSchema,
    fr: localeSchema,
    ru: localeSchema,
    ja: localeSchema,
    vi: localeSchema,
    zhTW: localeSchema,
  }),
})

type HomePageFormValues = z.infer<typeof homePageSchema>

function cloneLocales(
  locales: Record<InterfaceLanguageCode, HomePageLocaleConfig>
): Record<InterfaceLanguageCode, HomePageLocaleConfig> {
  return Object.fromEntries(
    HOME_PAGE_LANGUAGE_CODES.map((language) => [
      language,
      {
        hero: { ...locales[language].hero },
        cta: { ...locales[language].cta },
      },
    ])
  ) as Record<InterfaceLanguageCode, HomePageLocaleConfig>
}

function toFormValues(value: string): HomePageFormValues {
  const config = parseHomePageConfig(value)
  return {
    sections: { ...config.sections },
    locales: cloneLocales(config.locales),
  }
}

function toConfig(values: HomePageFormValues): HomePageConfig {
  return {
    ...DEFAULT_HOME_PAGE_CONFIG,
    sections: { ...values.sections },
    locales: cloneLocales(values.locales),
  }
}

type HomePageSectionProps = {
  defaultValue: string
}

type LocalizedCopyFieldsProps = {
  form: UseFormReturn<HomePageFormValues>
  language: InterfaceLanguageCode
}

type LocalizedCopyFieldPath = Extract<
  FieldPath<HomePageFormValues>,
  `locales.${InterfaceLanguageCode}.${string}`
>

function copyFieldPath(
  language: InterfaceLanguageCode,
  path:
    | `hero.${keyof HomePageLocaleConfig['hero']}`
    | `cta.${keyof HomePageLocaleConfig['cta']}`
): LocalizedCopyFieldPath {
  return `locales.${language}.${path}` as LocalizedCopyFieldPath
}

function LocalizedCopyFields({ form, language }: LocalizedCopyFieldsProps) {
  const { t } = useTranslation()

  return (
    <div className='space-y-7'>
      <SettingsSection title={t('Hero copy')}>
        <SettingsFormGrid>
          <FormField
            control={form.control}
            name={copyFieldPath(language, 'hero.badge')}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Hero badge')}</FormLabel>
                <FormControl>
                  <Input {...field} value={String(field.value)} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name={copyFieldPath(language, 'hero.title')}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Hero title')}</FormLabel>
                <FormControl>
                  <Input {...field} value={String(field.value)} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name={copyFieldPath(language, 'hero.highlightedTitle')}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Hero highlighted title')}</FormLabel>
                <FormControl>
                  <Input {...field} value={String(field.value)} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name={copyFieldPath(language, 'hero.supportEyebrow')}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Scenario support heading')}</FormLabel>
                <FormControl>
                  <Input {...field} value={String(field.value)} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name={copyFieldPath(language, 'hero.description')}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Hero description')}</FormLabel>
                <FormControl>
                  <Textarea rows={4} {...field} value={String(field.value)} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name={copyFieldPath(language, 'hero.supportDescription')}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Scenario support description')}</FormLabel>
                <FormControl>
                  <Textarea rows={4} {...field} value={String(field.value)} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </SettingsFormGrid>
      </SettingsSection>

      <SettingsSection title={t('Final call to action')}>
        <SettingsFormGrid>
          <FormField
            control={form.control}
            name={copyFieldPath(language, 'cta.titleFirst')}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('CTA title line one')}</FormLabel>
                <FormControl>
                  <Input {...field} value={String(field.value)} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name={copyFieldPath(language, 'cta.titleSecond')}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('CTA title line two')}</FormLabel>
                <FormControl>
                  <Input {...field} value={String(field.value)} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name={copyFieldPath(language, 'cta.description')}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('CTA description')}</FormLabel>
                <FormControl>
                  <Textarea rows={4} {...field} value={String(field.value)} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name={copyFieldPath(language, 'cta.actionLabel')}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('CTA action label')}</FormLabel>
                <FormControl>
                  <Input {...field} value={String(field.value)} />
                </FormControl>
                <FormDescription>
                  {t('The button opens the training workspace')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </SettingsFormGrid>
      </SettingsSection>
    </div>
  )
}

export function HomePageSection({ defaultValue }: HomePageSectionProps) {
  const { i18n, t } = useTranslation()
  const updateOption = useUpdateOption()
  const globalLanguage = normalizeInterfaceLanguage(i18n.language)
  const [activeLanguage, setActiveLanguage] = useState<InterfaceLanguageCode>(
    HOME_PAGE_LANGUAGE_CODES.includes(globalLanguage as InterfaceLanguageCode)
      ? (globalLanguage as InterfaceLanguageCode)
      : 'en'
  )
  const form = useForm<HomePageFormValues>({
    resolver: zodResolver(homePageSchema),
    defaultValues: toFormValues(defaultValue),
  })

  useEffect(() => {
    form.reset(toFormValues(defaultValue))
  }, [defaultValue, form])

  useEffect(() => {
    const nextLanguage = normalizeInterfaceLanguage(i18n.language)
    if (
      HOME_PAGE_LANGUAGE_CODES.includes(nextLanguage as InterfaceLanguageCode)
    ) {
      setActiveLanguage(nextLanguage as InterfaceLanguageCode)
    }
  }, [i18n.language])

  const onSubmit = async (values: HomePageFormValues) => {
    const nextValue = serializeHomePageConfig(toConfig(values))
    const currentValue = serializeHomePageConfig(
      toConfig(toFormValues(defaultValue))
    )
    if (nextValue === currentValue) return

    await updateOption.mutateAsync({
      key: HOME_PAGE_CONFIG_OPTION,
      value: nextValue,
    })
  }

  return (
    <SettingsSection title={t('Built-in home page')}>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)}>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            onReset={() => form.reset(toFormValues(defaultValue))}
            isSaving={updateOption.isPending}
            isResetDisabled={!form.formState.isDirty}
          />

          <SettingsSection title={t('Home page sections')}>
            <FormField
              control={form.control}
              name='sections.stats'
              render={({ field }) => (
                <SettingsSwitchItem>
                  <SettingsSwitchContent>
                    <FormLabel>{t('Show statistics')}</FormLabel>
                    <FormDescription>
                      {t('Show the built-in training and capability metrics')}
                    </FormDescription>
                  </SettingsSwitchContent>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </SettingsSwitchItem>
              )}
            />
            <FormField
              control={form.control}
              name='sections.features'
              render={({ field }) => (
                <SettingsSwitchItem>
                  <SettingsSwitchContent>
                    <FormLabel>{t('Show core capabilities')}</FormLabel>
                    <FormDescription>
                      {t('Show the built-in capabilities section')}
                    </FormDescription>
                  </SettingsSwitchContent>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </SettingsSwitchItem>
              )}
            />
            <FormField
              control={form.control}
              name='sections.workflow'
              render={({ field }) => (
                <SettingsSwitchItem>
                  <SettingsSwitchContent>
                    <FormLabel>{t('Show training workflow')}</FormLabel>
                    <FormDescription>
                      {t('Show the built-in workflow and training steps')}
                    </FormDescription>
                  </SettingsSwitchContent>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </SettingsSwitchItem>
              )}
            />
            <FormField
              control={form.control}
              name='sections.scenarioSupport'
              render={({ field }) => (
                <SettingsSwitchItem>
                  <SettingsSwitchContent>
                    <FormLabel>{t('Show scenario support')}</FormLabel>
                    <FormDescription>
                      {t(
                        'Show the scenario and counterpart guidance under the hero'
                      )}
                    </FormDescription>
                  </SettingsSwitchContent>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </SettingsSwitchItem>
              )}
            />
            <FormField
              control={form.control}
              name='sections.cta'
              render={({ field }) => (
                <SettingsSwitchItem>
                  <SettingsSwitchContent>
                    <FormLabel>{t('Show final call to action')}</FormLabel>
                    <FormDescription>
                      {t(
                        'Show the final entry point into the training workspace'
                      )}
                    </FormDescription>
                  </SettingsSwitchContent>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </SettingsSwitchItem>
              )}
            />
          </SettingsSection>

          <SettingsSection title={t('Localized home page copy')}>
            <Tabs
              value={activeLanguage}
              onValueChange={(value) =>
                setActiveLanguage(value as InterfaceLanguageCode)
              }
              className='min-w-0'
            >
              <div className='max-w-full overflow-x-auto pb-1'>
                <TabsList className='min-w-max'>
                  {INTERFACE_LANGUAGE_OPTIONS.map((language) => (
                    <TabsTrigger key={language.code} value={language.code}>
                      {language.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
              {INTERFACE_LANGUAGE_OPTIONS.map((language) => (
                <TabsContent
                  key={language.code}
                  value={language.code}
                  className='mt-6'
                >
                  <LocalizedCopyFields form={form} language={language.code} />
                </TabsContent>
              ))}
            </Tabs>
          </SettingsSection>
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
