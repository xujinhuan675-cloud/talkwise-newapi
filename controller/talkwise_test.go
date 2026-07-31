package controller

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

type closeNotifyRecorder struct {
	*httptest.ResponseRecorder
	closed chan bool
}

func newCloseNotifyRecorder() *closeNotifyRecorder {
	return &closeNotifyRecorder{
		ResponseRecorder: httptest.NewRecorder(),
		closed:           make(chan bool),
	}
}

func (recorder *closeNotifyRecorder) CloseNotify() <-chan bool {
	return recorder.closed
}

func setupTalkWiseControllerTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	previousDB := model.DB
	previousLogDB := model.LOG_DB
	previousType := common.MainDatabaseType()
	previousRedis := common.RedisEnabled
	previousSecret := common.SessionSecret
	previousRedirectDomains := constant.TrustedRedirectDomains

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(
		&model.AuthFlow{},
		&model.User{},
		&model.UserSession{},
		&model.SubscriptionPlan{},
		&model.UserSubscription{},
	))
	model.DB = db
	model.LOG_DB = db
	common.SetMainDatabaseType(common.DatabaseTypeSQLite)
	common.RedisEnabled = false
	common.SessionSecret = "talkwise-test-session-secret"
	constant.TrustedRedirectDomains = []string{"talkwise.example"}
	t.Setenv("TALKWISE_CLIENT_ID", "talkwise-test")
	t.Setenv("TALKWISE_CLIENT_SECRET", "client-secret")
	t.Setenv("TALKWISE_REDIRECT_URIS", "")
	t.Setenv("TALKWISE_REDIRECT_URI", "")
	t.Setenv("NEWAPI_TALKWISE_REDIRECT_URI", "")
	t.Cleanup(func() {
		model.DB = previousDB
		model.LOG_DB = previousLogDB
		common.SetMainDatabaseType(previousType)
		common.RedisEnabled = previousRedis
		common.SessionSecret = previousSecret
		constant.TrustedRedirectDomains = previousRedirectDomains
	})
	return db
}

func seedTalkWiseUser(t *testing.T, db *gorm.DB) *model.User {
	t.Helper()
	user := &model.User{
		Username:     "alice",
		Password:     "password",
		DisplayName:  "Alice Zhang",
		Role:         common.RoleAdminUser,
		Status:       common.UserStatusEnabled,
		Email:        "alice@example.com",
		Group:        "paid",
		AffCode:      "aff-alice",
		Quota:        1200,
		UsedQuota:    300,
		RequestCount: 12,
	}
	require.NoError(t, db.Create(user).Error)
	return user
}

func decodeTalkWiseResponse[T any](t *testing.T, recorder *httptest.ResponseRecorder) struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	Data    T      `json:"data"`
} {
	t.Helper()
	var response struct {
		Success bool   `json:"success"`
		Message string `json:"message"`
		Data    T      `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	return response
}

func TestCreateTalkWiseAuthHandoffBindsCodeToCurrentDashboardUser(t *testing.T) {
	db := setupTalkWiseControllerTestDB(t)
	user := seedTalkWiseUser(t, db)

	router := gin.New()
	router.POST("/api/talkwise/auth/handoff", func(c *gin.Context) {
		c.Set("id", user.Id)
		c.Set("session_id", "session-1")
		CreateTalkWiseAuthHandoff(c)
	})
	body := `{"client_id":"talkwise-test","redirect_uri":"https://talkwise.example/login","return_to":"https://talkwise.example/login?from=%2Ftraining","state":"csrf-state"}`
	request := httptest.NewRequest(http.MethodPost, "/api/talkwise/auth/handoff", strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()

	router.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusOK, recorder.Code)
	response := decodeTalkWiseResponse[struct {
		Code        string `json:"code"`
		RedirectURL string `json:"redirect_url"`
		RedirectURI string `json:"redirect_uri"`
		ReturnTo    string `json:"return_to"`
		ExpiresAt   int64  `json:"expires_at"`
	}](t, recorder)
	require.True(t, response.Success, response.Message)
	assert.NotEmpty(t, response.Data.Code)
	assert.Equal(t, "https://talkwise.example/login", response.Data.RedirectURI)
	assert.Equal(t, "https://talkwise.example/login?from=%2Ftraining", response.Data.ReturnTo)
	assert.Contains(t, response.Data.RedirectURL, "talkwise_code=")
	assert.Contains(t, response.Data.RedirectURL, "state=csrf-state")
	assert.Greater(t, response.Data.ExpiresAt, time.Now().Unix())

	flow, err := model.GetAuthFlow(response.Data.Code, model.AuthFlowMatch{
		Purpose:   model.AuthFlowPurposeTalkWiseHandoff,
		Provider:  "talkwise-test",
		Intent:    model.AuthFlowIntentLogin,
		UserId:    user.Id,
		SessionId: "session-1",
	})
	require.NoError(t, err)
	var payload talkWiseAuthFlowPayload
	require.NoError(t, common.UnmarshalJsonStr(flow.Payload, &payload))
	assert.Equal(t, "https://talkwise.example/login", payload.RedirectURI)
	assert.Equal(t, "https://talkwise.example/login?from=%2Ftraining", payload.ReturnTo)
	assert.Equal(t, "csrf-state", payload.State)
}

func TestExchangeTalkWiseAuthCodeReturnsUserAndControlPlaneClaims(t *testing.T) {
	db := setupTalkWiseControllerTestDB(t)
	user := seedTalkWiseUser(t, db)
	plan := &model.SubscriptionPlan{Title: "Pro", Enabled: true}
	require.NoError(t, db.Create(plan).Error)
	require.NoError(t, db.Create(&model.UserSubscription{
		UserId:              user.Id,
		PlanId:              plan.Id,
		AmountTotal:         1000,
		AmountUsed:          100,
		StartTime:           common.GetTimestamp() - 60,
		EndTime:             common.GetTimestamp() + 3600,
		Status:              "active",
		AllowWalletOverflow: true,
	}).Error)
	payloadBytes, err := common.Marshal(talkWiseAuthFlowPayload{
		RedirectURI: "https://talkwise.example/login",
		ReturnTo:    "https://talkwise.example/login",
	})
	require.NoError(t, err)
	code, _, err := model.CreateAuthFlow(model.AuthFlowCreate{
		Purpose:   model.AuthFlowPurposeTalkWiseHandoff,
		Provider:  "talkwise-test",
		Intent:    model.AuthFlowIntentLogin,
		UserId:    user.Id,
		Payload:   string(payloadBytes),
		ExpiresAt: time.Now().Add(time.Minute),
	})
	require.NoError(t, err)

	router := gin.New()
	router.POST("/api/talkwise/auth/exchange", ExchangeTalkWiseAuthCode)
	body := `{"client_id":"talkwise-test","client_secret":"client-secret","code":"` + code + `","redirect_uri":"https://talkwise.example/login"}`
	request := httptest.NewRequest(http.MethodPost, "/api/talkwise/auth/exchange", strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	request.Host = "newapi.example"
	request.Header.Set("X-Forwarded-Proto", "https")
	recorder := httptest.NewRecorder()

	router.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusOK, recorder.Code)
	response := decodeTalkWiseResponse[struct {
		User struct {
			Id           int    `json:"id"`
			Username     string `json:"username"`
			DisplayName  string `json:"display_name"`
			Role         int    `json:"role"`
			Status       int    `json:"status"`
			Group        string `json:"group"`
			Quota        int    `json:"quota"`
			UsedQuota    int    `json:"used_quota"`
			RequestCount int    `json:"request_count"`
		} `json:"user"`
		Team struct {
			Id   string `json:"id"`
			Name string `json:"name"`
		} `json:"team"`
		SubscriptionPlan   string `json:"subscription_plan"`
		SubscriptionStatus string `json:"subscription_status"`
		Gateway            struct {
			BaseURL string `json:"base_url"`
		} `json:"gateway"`
	}](t, recorder)
	require.True(t, response.Success, response.Message)
	assert.Equal(t, user.Id, response.Data.User.Id)
	assert.Equal(t, "alice", response.Data.User.Username)
	assert.Equal(t, "Alice Zhang", response.Data.User.DisplayName)
	assert.Equal(t, common.RoleAdminUser, response.Data.User.Role)
	assert.Equal(t, common.UserStatusEnabled, response.Data.User.Status)
	assert.Equal(t, "paid", response.Data.User.Group)
	assert.Equal(t, 1200, response.Data.User.Quota)
	assert.Equal(t, 300, response.Data.User.UsedQuota)
	assert.Equal(t, 12, response.Data.User.RequestCount)
	assert.Equal(t, "newapi:paid", response.Data.Team.Id)
	assert.Equal(t, "paid", response.Data.Team.Name)
	assert.Equal(t, "Pro", response.Data.SubscriptionPlan)
	assert.Equal(t, "active", response.Data.SubscriptionStatus)
	assert.Equal(t, "https://newapi.example", response.Data.Gateway.BaseURL)

	_, err = model.GetAuthFlow(code, model.AuthFlowMatch{Purpose: model.AuthFlowPurposeTalkWiseHandoff})
	assert.ErrorIs(t, err, model.ErrAuthFlowConsumed)
}

func TestExchangeTalkWiseAuthCodeRejectsReplayAndRedirectMismatch(t *testing.T) {
	db := setupTalkWiseControllerTestDB(t)
	user := seedTalkWiseUser(t, db)
	payloadBytes, err := common.Marshal(talkWiseAuthFlowPayload{
		RedirectURI: "https://talkwise.example/login",
	})
	require.NoError(t, err)
	code, _, err := model.CreateAuthFlow(model.AuthFlowCreate{
		Purpose:   model.AuthFlowPurposeTalkWiseHandoff,
		Provider:  "talkwise-test",
		Intent:    model.AuthFlowIntentLogin,
		UserId:    user.Id,
		Payload:   string(payloadBytes),
		ExpiresAt: time.Now().Add(time.Minute),
	})
	require.NoError(t, err)

	router := gin.New()
	router.POST("/api/talkwise/auth/exchange", ExchangeTalkWiseAuthCode)

	mismatchBody := `{"client_id":"talkwise-test","client_secret":"client-secret","code":"` + code + `","redirect_uri":"https://talkwise.example/other"}`
	mismatchRequest := httptest.NewRequest(http.MethodPost, "/api/talkwise/auth/exchange", strings.NewReader(mismatchBody))
	mismatchRequest.Header.Set("Content-Type", "application/json")
	mismatchRecorder := httptest.NewRecorder()
	router.ServeHTTP(mismatchRecorder, mismatchRequest)
	mismatchResponse := decodeTalkWiseResponse[gin.H](t, mismatchRecorder)
	require.False(t, mismatchResponse.Success)
	_, err = model.GetAuthFlow(code, model.AuthFlowMatch{Purpose: model.AuthFlowPurposeTalkWiseHandoff})
	require.NoError(t, err)

	validBody := `{"client_id":"talkwise-test","client_secret":"client-secret","code":"` + code + `","redirect_uri":"https://talkwise.example/login"}`
	validRequest := httptest.NewRequest(http.MethodPost, "/api/talkwise/auth/exchange", strings.NewReader(validBody))
	validRequest.Header.Set("Content-Type", "application/json")
	validRecorder := httptest.NewRecorder()
	router.ServeHTTP(validRecorder, validRequest)
	validResponse := decodeTalkWiseResponse[gin.H](t, validRecorder)
	require.True(t, validResponse.Success, validResponse.Message)

	replayRequest := httptest.NewRequest(http.MethodPost, "/api/talkwise/auth/exchange", strings.NewReader(validBody))
	replayRequest.Header.Set("Content-Type", "application/json")
	replayRecorder := httptest.NewRecorder()
	router.ServeHTTP(replayRecorder, replayRequest)
	replayResponse := decodeTalkWiseResponse[gin.H](t, replayRecorder)
	assert.False(t, replayResponse.Success)
	assert.Contains(t, replayResponse.Message, "consumed")
}

func TestTalkWiseTeamMemberBridgeListsSearchesAndAssignsNewAPIGroup(t *testing.T) {
	db := setupTalkWiseControllerTestDB(t)
	alice := seedTalkWiseUser(t, db)
	bob := &model.User{
		Username:     "bob",
		Password:     "password",
		DisplayName:  "Bob Li",
		Role:         common.RoleCommonUser,
		Status:       common.UserStatusEnabled,
		Email:        "bob@example.com",
		Group:        "free",
		AffCode:      "aff-bob",
		Quota:        400,
		UsedQuota:    30,
		RequestCount: 4,
	}
	disabled := &model.User{
		Username:    "disabled",
		Password:    "password",
		DisplayName: "Disabled User",
		Role:        common.RoleCommonUser,
		Status:      common.UserStatusDisabled,
		Email:       "disabled@example.com",
		Group:       "paid",
		AffCode:     "aff-disabled",
	}
	require.NoError(t, db.Create(bob).Error)
	require.NoError(t, db.Create(disabled).Error)

	router := gin.New()
	router.POST("/api/talkwise/team/members", ListTalkWiseTeamMembers)
	router.POST("/api/talkwise/team/users/search", SearchTalkWiseTeamUsers)
	router.POST("/api/talkwise/team/members/assign", AssignTalkWiseTeamMember)

	listBody := `{"client_id":"talkwise-test","client_secret":"client-secret","group":"paid"}`
	listRequest := httptest.NewRequest(http.MethodPost, "/api/talkwise/team/members", strings.NewReader(listBody))
	listRequest.Header.Set("Content-Type", "application/json")
	listRecorder := httptest.NewRecorder()
	router.ServeHTTP(listRecorder, listRequest)

	require.Equal(t, http.StatusOK, listRecorder.Code)
	listResponse := decodeTalkWiseResponse[struct {
		Team struct {
			Id    string `json:"id"`
			Name  string `json:"name"`
			Group string `json:"group"`
		} `json:"team"`
		Members []struct {
			Id       int    `json:"id"`
			Username string `json:"username"`
			Group    string `json:"group"`
			InTeam   bool   `json:"in_team"`
		} `json:"members"`
		Total int64 `json:"total"`
	}](t, listRecorder)
	require.True(t, listResponse.Success, listResponse.Message)
	assert.Equal(t, "newapi:paid", listResponse.Data.Team.Id)
	assert.Equal(t, "paid", listResponse.Data.Team.Name)
	require.Len(t, listResponse.Data.Members, 1)
	assert.Equal(t, alice.Id, listResponse.Data.Members[0].Id)
	assert.Equal(t, "alice", listResponse.Data.Members[0].Username)
	assert.Equal(t, "paid", listResponse.Data.Members[0].Group)
	assert.True(t, listResponse.Data.Members[0].InTeam)
	assert.EqualValues(t, 1, listResponse.Data.Total)

	searchBody := `{"client_id":"talkwise-test","client_secret":"client-secret","group":"paid","keyword":"bob"}`
	searchRequest := httptest.NewRequest(http.MethodPost, "/api/talkwise/team/users/search", strings.NewReader(searchBody))
	searchRequest.Header.Set("Content-Type", "application/json")
	searchRecorder := httptest.NewRecorder()
	router.ServeHTTP(searchRecorder, searchRequest)

	searchResponse := decodeTalkWiseResponse[struct {
		Users []struct {
			Id       int    `json:"id"`
			Username string `json:"username"`
			Group    string `json:"group"`
			InTeam   bool   `json:"in_team"`
		} `json:"users"`
	}](t, searchRecorder)
	require.True(t, searchResponse.Success, searchResponse.Message)
	require.Len(t, searchResponse.Data.Users, 1)
	assert.Equal(t, bob.Id, searchResponse.Data.Users[0].Id)
	assert.Equal(t, "free", searchResponse.Data.Users[0].Group)
	assert.False(t, searchResponse.Data.Users[0].InTeam)

	assignBody := `{"client_id":"talkwise-test","client_secret":"client-secret","group":"paid","user_id":` + strconv.Itoa(bob.Id) + `}`
	assignRequest := httptest.NewRequest(http.MethodPost, "/api/talkwise/team/members/assign", strings.NewReader(assignBody))
	assignRequest.Header.Set("Content-Type", "application/json")
	assignRecorder := httptest.NewRecorder()
	router.ServeHTTP(assignRecorder, assignRequest)

	assignResponse := decodeTalkWiseResponse[struct {
		Member struct {
			Id       int    `json:"id"`
			Username string `json:"username"`
			Group    string `json:"group"`
			InTeam   bool   `json:"in_team"`
		} `json:"member"`
	}](t, assignRecorder)
	require.True(t, assignResponse.Success, assignResponse.Message)
	assert.Equal(t, bob.Id, assignResponse.Data.Member.Id)
	assert.Equal(t, "paid", assignResponse.Data.Member.Group)
	assert.True(t, assignResponse.Data.Member.InTeam)

	var updatedBob model.User
	require.NoError(t, db.First(&updatedBob, bob.Id).Error)
	assert.Equal(t, "paid", updatedBob.Group)
}

func TestTalkWiseTeamMemberBridgeRejectsInvalidClientSecret(t *testing.T) {
	db := setupTalkWiseControllerTestDB(t)
	seedTalkWiseUser(t, db)

	router := gin.New()
	router.POST("/api/talkwise/team/members", ListTalkWiseTeamMembers)
	body := `{"client_id":"talkwise-test","client_secret":"wrong","group":"paid"}`
	request := httptest.NewRequest(http.MethodPost, "/api/talkwise/team/members", strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()

	router.ServeHTTP(recorder, request)

	response := decodeTalkWiseResponse[gin.H](t, recorder)
	assert.False(t, response.Success)
	assert.Contains(t, response.Message, "client_secret")
}

func TestTalkWiseTrainingProxyPreservesRequestAndResponseContract(t *testing.T) {
	type observedRequest struct {
		Method         string
		Path           string
		RawQuery       string
		Authorization  string
		ContentType    string
		IdempotencyKey string
		Cookie         string
		MockUser       string
		UserID         string
		UserRole       string
		SystemRole     string
		Role           string
		TeamID         string
		ForwardedUser  string
		Body           string
	}
	observed := make(chan observedRequest, 1)
	upstream := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		body, _ := io.ReadAll(request.Body)
		observed <- observedRequest{
			Method:         request.Method,
			Path:           request.URL.Path,
			RawQuery:       request.URL.RawQuery,
			Authorization:  request.Header.Get("Authorization"),
			ContentType:    request.Header.Get("Content-Type"),
			IdempotencyKey: request.Header.Get("Idempotency-Key"),
			Cookie:         request.Header.Get("Cookie"),
			MockUser:       request.Header.Get("X-Mock-User"),
			UserID:         request.Header.Get("X-User-Id"),
			UserRole:       request.Header.Get("X-User-Role"),
			SystemRole:     request.Header.Get("X-System-Role"),
			Role:           request.Header.Get("X-Role"),
			TeamID:         request.Header.Get("X-Team-Id"),
			ForwardedUser:  request.Header.Get("X-Forwarded-User"),
			Body:           string(body),
		}
		writer.Header().Set("Content-Type", "application/problem+json")
		writer.Header().Set("X-TalkWise-Upstream", "reached")
		writer.WriteHeader(http.StatusCreated)
		_, _ = writer.Write([]byte(`{"success":true,"data":{"id":"session-1"}}`))
	}))
	defer upstream.Close()
	t.Setenv(talkWiseTrainingUpstreamEnv, upstream.URL+"/internal")

	router := gin.New()
	router.Any("/api/talkwise/training/*path", ProxyTalkWiseTraining)
	body := `{"mode":"text","scenario_template_id":"discovery"}`
	request := httptest.NewRequest(
		http.MethodPost,
		"/api/talkwise/training/sessions?page=2&mock_user=admin&auth_user_id=other&auth_role=root&auth_team_id=other-team",
		strings.NewReader(body),
	)
	request.Header.Set("Authorization", "Bearer dashboard-access-token")
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Idempotency-Key", "create-session-1")
	request.Header.Set("Cookie", "talkwise_session=spoofed")
	request.Header.Set("X-Mock-User", "admin")
	request.Header.Set("X-User-Id", "other-user")
	request.Header.Set("X-User-Role", "root")
	request.Header.Set("X-System-Role", "root")
	request.Header.Set("X-Role", "root")
	request.Header.Set("X-Team-Id", "other-team")
	request.Header.Set("X-Forwarded-User", "other-user")
	recorder := newCloseNotifyRecorder()

	router.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusCreated, recorder.Code)
	assert.Equal(t, "application/problem+json", recorder.Header().Get("Content-Type"))
	assert.Equal(t, "reached", recorder.Header().Get("X-TalkWise-Upstream"))
	assert.JSONEq(t, `{"success":true,"data":{"id":"session-1"}}`, recorder.Body.String())

	forwarded := <-observed
	assert.Equal(t, http.MethodPost, forwarded.Method)
	assert.Equal(t, "/internal/api/v1/training-studio/sessions", forwarded.Path)
	assert.Equal(t, "page=2", forwarded.RawQuery)
	assert.Equal(t, "Bearer dashboard-access-token", forwarded.Authorization)
	assert.Equal(t, "application/json", forwarded.ContentType)
	assert.Equal(t, "create-session-1", forwarded.IdempotencyKey)
	assert.Empty(t, forwarded.Cookie)
	assert.Empty(t, forwarded.MockUser)
	assert.Empty(t, forwarded.UserID)
	assert.Empty(t, forwarded.UserRole)
	assert.Empty(t, forwarded.SystemRole)
	assert.Empty(t, forwarded.Role)
	assert.Empty(t, forwarded.TeamID)
	assert.Empty(t, forwarded.ForwardedUser)
	assert.JSONEq(t, body, forwarded.Body)
}

func TestTalkWisePreparationProxiesUseFixedScopedNamespaces(t *testing.T) {
	type observedRequest struct {
		Path          string
		RawQuery      string
		Authorization string
		Cookie        string
		MockUser      string
	}
	observed := make(chan observedRequest, 2)
	upstream := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		observed <- observedRequest{
			Path:          request.URL.Path,
			RawQuery:      request.URL.RawQuery,
			Authorization: request.Header.Get("Authorization"),
			Cookie:        request.Header.Get("Cookie"),
			MockUser:      request.Header.Get("X-Mock-User"),
		}
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"success":true}`))
	}))
	defer upstream.Close()
	t.Setenv(talkWiseTrainingUpstreamEnv, upstream.URL+"/internal")

	router := gin.New()
	router.Any("/api/talkwise/battle-prep/*path", ProxyTalkWiseBattlePrep)
	router.Any("/api/talkwise/defense-prep/*path", ProxyTalkWiseDefensePrep)

	for _, testCase := range []struct {
		path          string
		expectedPath  string
		expectedQuery string
	}{
		{
			path:          "/api/talkwise/battle-prep/start?source=workspace&mock_user=admin&auth_user_id=other",
			expectedPath:  "/internal/api/v1/stakeholder/battle-prep/start",
			expectedQuery: "source=workspace",
		},
		{
			path:          "/api/talkwise/defense-prep/sessions/7?mock_user=admin&auth_team_id=other-team",
			expectedPath:  "/internal/api/v1/defense-prep/sessions/7",
			expectedQuery: "",
		},
	} {
		request := httptest.NewRequest(http.MethodPost, testCase.path, nil)
		request.Header.Set("Authorization", "Bearer dashboard-access-token")
		request.Header.Set("Cookie", "talkwise_session=spoofed")
		request.Header.Set("X-Mock-User", "admin")
		recorder := newCloseNotifyRecorder()

		router.ServeHTTP(recorder, request)

		require.Equal(t, http.StatusOK, recorder.Code)
		forwarded := <-observed
		assert.Equal(t, testCase.expectedPath, forwarded.Path)
		assert.Equal(t, testCase.expectedQuery, forwarded.RawQuery)
		assert.Equal(t, "Bearer dashboard-access-token", forwarded.Authorization)
		assert.Empty(t, forwarded.Cookie)
		assert.Empty(t, forwarded.MockUser)
	}
}

func TestTalkWisePersonaProxyPreservesScopedResourceContract(t *testing.T) {
	type observedRequest struct {
		Method        string
		Path          string
		RawQuery      string
		Authorization string
		ContentType   string
		Cookie        string
		MockUser      string
		UserID        string
		TeamID        string
		Body          string
	}
	observed := make(chan observedRequest, 2)
	upstream := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		body, _ := io.ReadAll(request.Body)
		observed <- observedRequest{
			Method:        request.Method,
			Path:          request.URL.Path,
			RawQuery:      request.URL.RawQuery,
			Authorization: request.Header.Get("Authorization"),
			ContentType:   request.Header.Get("Content-Type"),
			Cookie:        request.Header.Get("Cookie"),
			MockUser:      request.Header.Get("X-Mock-User"),
			UserID:        request.Header.Get("X-User-Id"),
			TeamID:        request.Header.Get("X-Team-Id"),
			Body:          string(body),
		}
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"success":true}`))
	}))
	defer upstream.Close()
	t.Setenv(talkWiseTrainingUpstreamEnv, upstream.URL+"/internal")

	router := gin.New()
	router.Any("/api/talkwise/personas", ProxyTalkWisePersonas)
	router.Any("/api/talkwise/personas/*path", ProxyTalkWisePersonas)

	listRequest := httptest.NewRequest(
		http.MethodGet,
		"/api/talkwise/personas?visibility=team&mock_user=admin&auth_user_id=other&auth_team_id=other-team",
		nil,
	)
	listRequest.Header.Set("Authorization", "Bearer dashboard-access-token")
	listRequest.Header.Set("Cookie", "talkwise_session=spoofed")
	listRequest.Header.Set("X-Mock-User", "admin")
	listRequest.Header.Set("X-User-Id", "other-user")
	listRequest.Header.Set("X-Team-Id", "other-team")
	listRecorder := newCloseNotifyRecorder()

	router.ServeHTTP(listRecorder, listRequest)

	require.Equal(t, http.StatusOK, listRecorder.Code)
	forwardedList := <-observed
	assert.Equal(t, http.MethodGet, forwardedList.Method)
	assert.Equal(t, "/internal/api/v1/stakeholder/personas", forwardedList.Path)
	assert.Equal(t, "visibility=team", forwardedList.RawQuery)
	assert.Equal(t, "Bearer dashboard-access-token", forwardedList.Authorization)
	assert.Empty(t, forwardedList.Cookie)
	assert.Empty(t, forwardedList.MockUser)
	assert.Empty(t, forwardedList.UserID)
	assert.Empty(t, forwardedList.TeamID)

	patchBody := `{"name":"Enterprise CFO","rejected_features":{"hard_rules":[0]}}`
	patchRequest := httptest.NewRequest(
		http.MethodPatch,
		"/api/talkwise/personas/cfo/v2?include=evidence&auth_role=root",
		strings.NewReader(patchBody),
	)
	patchRequest.Header.Set("Authorization", "Bearer dashboard-access-token")
	patchRequest.Header.Set("Content-Type", "application/json")
	patchRecorder := newCloseNotifyRecorder()

	router.ServeHTTP(patchRecorder, patchRequest)

	require.Equal(t, http.StatusOK, patchRecorder.Code)
	forwardedPatch := <-observed
	assert.Equal(t, http.MethodPatch, forwardedPatch.Method)
	assert.Equal(t, "/internal/api/v1/stakeholder/personas/cfo/v2", forwardedPatch.Path)
	assert.Equal(t, "include=evidence", forwardedPatch.RawQuery)
	assert.Equal(t, "Bearer dashboard-access-token", forwardedPatch.Authorization)
	assert.Equal(t, "application/json", forwardedPatch.ContentType)
	assert.JSONEq(t, patchBody, forwardedPatch.Body)
}

func TestTalkWisePersonaBuilderMapsOnlyFixedPostActionsAndStreamsSSE(t *testing.T) {
	type observedRequest struct {
		Path          string
		RawQuery      string
		Authorization string
		Cookie        string
		MockUser      string
		Body          string
	}
	observed := make(chan observedRequest, 2)
	upstream := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		body, _ := io.ReadAll(request.Body)
		observed <- observedRequest{
			Path:          request.URL.Path,
			RawQuery:      request.URL.RawQuery,
			Authorization: request.Header.Get("Authorization"),
			Cookie:        request.Header.Get("Cookie"),
			MockUser:      request.Header.Get("X-Mock-User"),
			Body:          string(body),
		}
		if strings.HasSuffix(request.URL.Path, "/build") {
			writer.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
			_, _ = writer.Write([]byte("data: {\"seq\":1,\"type\":\"workspace_ready\"}\n\n"))
			return
		}
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"success":true,"data":[]}`))
	}))
	defer upstream.Close()
	t.Setenv(talkWiseTrainingUpstreamEnv, upstream.URL+"/internal")

	router := gin.New()
	router.POST("/api/talkwise/persona-builder/detect-speakers", ProxyTalkWisePersonaDetectSpeakers)
	router.POST("/api/talkwise/persona-builder/build", ProxyTalkWisePersonaBuild)

	for _, testCase := range []struct {
		path                 string
		expectedUpstreamPath string
		expectedContentType  string
		expectedResponse     string
	}{
		{
			path:                 "/api/talkwise/persona-builder/detect-speakers?locale=zh&mock_user=admin",
			expectedUpstreamPath: "/internal/api/v1/stakeholder/persona/detect-speakers",
			expectedContentType:  "application/json",
			expectedResponse:     `{"success":true,"data":[]}`,
		},
		{
			path:                 "/api/talkwise/persona-builder/build?mode=guided&auth_user_id=other",
			expectedUpstreamPath: "/internal/api/v1/stakeholder/persona/build",
			expectedContentType:  "text/event-stream; charset=utf-8",
			expectedResponse:     "data: {\"seq\":1,\"type\":\"workspace_ready\"}\n\n",
		},
	} {
		body := `{"materials":["speaker: hello"]}`
		request := httptest.NewRequest(http.MethodPost, testCase.path, strings.NewReader(body))
		request.Header.Set("Authorization", "Bearer dashboard-access-token")
		request.Header.Set("Content-Type", "application/json")
		request.Header.Set("Cookie", "talkwise_session=spoofed")
		request.Header.Set("X-Mock-User", "admin")
		recorder := newCloseNotifyRecorder()

		router.ServeHTTP(recorder, request)

		require.Equal(t, http.StatusOK, recorder.Code)
		assert.Equal(t, testCase.expectedContentType, recorder.Header().Get("Content-Type"))
		if strings.HasPrefix(testCase.expectedContentType, "application/json") {
			assert.JSONEq(t, testCase.expectedResponse, recorder.Body.String())
		} else {
			assert.Equal(t, testCase.expectedResponse, recorder.Body.String())
		}
		forwarded := <-observed
		assert.Equal(t, testCase.expectedUpstreamPath, forwarded.Path)
		assert.Equal(t, strings.Split(strings.Split(testCase.path, "?")[1], "&")[0], forwarded.RawQuery)
		assert.Equal(t, "Bearer dashboard-access-token", forwarded.Authorization)
		assert.Empty(t, forwarded.Cookie)
		assert.Empty(t, forwarded.MockUser)
		assert.JSONEq(t, body, forwarded.Body)
	}
}

func TestTalkWisePersonaProxiesReportUnavailableConfigurationAndUpstream(t *testing.T) {
	t.Setenv(talkWiseTrainingUpstreamEnv, "")
	for _, testCase := range []struct {
		name         string
		path         string
		handler      gin.HandlerFunc
		expectedCode string
	}{
		{
			name:         "persona",
			path:         "/api/talkwise/personas",
			handler:      ProxyTalkWisePersonas,
			expectedCode: talkWisePersonaProxyUnavailable,
		},
		{
			name:         "builder",
			path:         "/api/talkwise/persona-builder/build",
			handler:      ProxyTalkWisePersonaBuild,
			expectedCode: talkWisePersonaBuilderProxyUnavailable,
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			router := gin.New()
			router.POST(testCase.path, testCase.handler)
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, testCase.path, nil))

			require.Equal(t, http.StatusServiceUnavailable, recorder.Code)
			var response struct {
				Success bool   `json:"success"`
				Code    string `json:"code"`
			}
			require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
			assert.False(t, response.Success)
			assert.Equal(t, testCase.expectedCode, response.Code)
		})
	}

	deadUpstream := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	deadURL := deadUpstream.URL
	deadUpstream.Close()
	t.Setenv(talkWiseTrainingUpstreamEnv, deadURL)
	router := gin.New()
	router.POST("/api/talkwise/persona-builder/build", ProxyTalkWisePersonaBuild)
	recorder := newCloseNotifyRecorder()
	router.ServeHTTP(
		recorder,
		httptest.NewRequest(http.MethodPost, "/api/talkwise/persona-builder/build", nil),
	)

	require.Equal(t, http.StatusBadGateway, recorder.Code)
	var response struct {
		Success bool   `json:"success"`
		Code    string `json:"code"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	assert.False(t, response.Success)
	assert.Equal(t, talkWisePersonaBuilderUpstreamUnavailable, response.Code)
}

func TestTalkWiseConversationTreeProxyPreservesMessageTreeAndStreamingChatContract(t *testing.T) {
	type observedRequest struct {
		Method        string
		Path          string
		RawQuery      string
		Authorization string
		ContentType   string
		Cookie        string
		MockUser      string
		UserID        string
		TeamID        string
		Body          string
	}
	observed := make(chan observedRequest, 2)
	upstream := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		body, _ := io.ReadAll(request.Body)
		observed <- observedRequest{
			Method:        request.Method,
			Path:          request.URL.Path,
			RawQuery:      request.URL.RawQuery,
			Authorization: request.Header.Get("Authorization"),
			ContentType:   request.Header.Get("Content-Type"),
			Cookie:        request.Header.Get("Cookie"),
			MockUser:      request.Header.Get("X-Mock-User"),
			UserID:        request.Header.Get("X-User-Id"),
			TeamID:        request.Header.Get("X-Team-Id"),
			Body:          string(body),
		}

		switch request.URL.Path {
		case "/internal/api/v1/conversations/42/messages":
			writer.Header().Set("Content-Type", "application/json")
			_, _ = writer.Write([]byte(`{"code":0,"data":{"items":[]}}`))
		case "/internal/api/v1/conversations/42/chat":
			writer.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
			_, _ = writer.Write([]byte("event: message\ndata: {\"delta\":\"hello\"}\n\n"))
		default:
			writer.WriteHeader(http.StatusNotFound)
		}
	}))
	defer upstream.Close()
	t.Setenv(talkWiseTrainingUpstreamEnv, upstream.URL+"/internal")

	router := gin.New()
	router.Any("/api/talkwise/conversation-tree/*path", ProxyTalkWiseConversationTree)

	messagesRequest := httptest.NewRequest(
		http.MethodGet,
		"/api/talkwise/conversation-tree/42/messages?page=2&mock_user=admin&auth_user_id=other&auth_team_id=other-team",
		nil,
	)
	messagesRequest.Header.Set("Authorization", "Bearer dashboard-access-token")
	messagesRequest.Header.Set("Cookie", "talkwise_session=spoofed")
	messagesRequest.Header.Set("X-Mock-User", "admin")
	messagesRequest.Header.Set("X-User-Id", "other-user")
	messagesRequest.Header.Set("X-Team-Id", "other-team")
	messagesRecorder := newCloseNotifyRecorder()

	router.ServeHTTP(messagesRecorder, messagesRequest)

	require.Equal(t, http.StatusOK, messagesRecorder.Code)
	assert.Equal(t, "application/json", messagesRecorder.Header().Get("Content-Type"))
	assert.JSONEq(t, `{"code":0,"data":{"items":[]}}`, messagesRecorder.Body.String())
	forwardedMessages := <-observed
	assert.Equal(t, http.MethodGet, forwardedMessages.Method)
	assert.Equal(t, "/internal/api/v1/conversations/42/messages", forwardedMessages.Path)
	assert.Equal(t, "page=2", forwardedMessages.RawQuery)
	assert.Equal(t, "Bearer dashboard-access-token", forwardedMessages.Authorization)
	assert.Empty(t, forwardedMessages.Cookie)
	assert.Empty(t, forwardedMessages.MockUser)
	assert.Empty(t, forwardedMessages.UserID)
	assert.Empty(t, forwardedMessages.TeamID)

	chatBody := `{"message":"hello","stream":true}`
	chatRequest := httptest.NewRequest(
		http.MethodPost,
		"/api/talkwise/conversation-tree/42/chat",
		strings.NewReader(chatBody),
	)
	chatRequest.Header.Set("Authorization", "Bearer dashboard-access-token")
	chatRequest.Header.Set("Content-Type", "application/json")
	chatRecorder := newCloseNotifyRecorder()

	router.ServeHTTP(chatRecorder, chatRequest)

	require.Equal(t, http.StatusOK, chatRecorder.Code)
	assert.Equal(t, "text/event-stream; charset=utf-8", chatRecorder.Header().Get("Content-Type"))
	assert.Equal(t, "event: message\ndata: {\"delta\":\"hello\"}\n\n", chatRecorder.Body.String())
	forwardedChat := <-observed
	assert.Equal(t, http.MethodPost, forwardedChat.Method)
	assert.Equal(t, "/internal/api/v1/conversations/42/chat", forwardedChat.Path)
	assert.Equal(t, "Bearer dashboard-access-token", forwardedChat.Authorization)
	assert.Equal(t, "application/json", forwardedChat.ContentType)
	assert.JSONEq(t, chatBody, forwardedChat.Body)
}

func TestTalkWiseConversationTreeProxyReportsUnavailableConfiguration(t *testing.T) {
	t.Setenv(talkWiseTrainingUpstreamEnv, "")
	router := gin.New()
	router.Any("/api/talkwise/conversation-tree/*path", ProxyTalkWiseConversationTree)
	recorder := httptest.NewRecorder()

	router.ServeHTTP(
		recorder,
		httptest.NewRequest(http.MethodGet, "/api/talkwise/conversation-tree/42/messages", nil),
	)

	require.Equal(t, http.StatusServiceUnavailable, recorder.Code)
	var response struct {
		Success bool   `json:"success"`
		Code    string `json:"code"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	assert.False(t, response.Success)
	assert.Equal(t, talkWiseConversationTreeProxyUnavailable, response.Code)
}

func TestTalkWiseTrainingProxyReturnsServiceUnavailableWithoutConfiguration(t *testing.T) {
	t.Setenv(talkWiseTrainingUpstreamEnv, "")
	router := gin.New()
	router.Any("/api/talkwise/training/*path", ProxyTalkWiseTraining)
	recorder := httptest.NewRecorder()

	router.ServeHTTP(
		recorder,
		httptest.NewRequest(http.MethodGet, "/api/talkwise/training/scenario-templates", nil),
	)

	require.Equal(t, http.StatusServiceUnavailable, recorder.Code)
	var response struct {
		Success bool   `json:"success"`
		Code    string `json:"code"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	assert.False(t, response.Success)
	assert.Equal(t, talkWiseTrainingProxyUnavailable, response.Code)
}

func TestTalkWiseTrainingProxyReturnsBadGatewayWhenUpstreamIsUnavailable(t *testing.T) {
	deadUpstream := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	deadURL := deadUpstream.URL
	deadUpstream.Close()
	t.Setenv(talkWiseTrainingUpstreamEnv, deadURL)
	router := gin.New()
	router.Any("/api/talkwise/training/*path", ProxyTalkWiseTraining)
	recorder := newCloseNotifyRecorder()

	router.ServeHTTP(
		recorder,
		httptest.NewRequest(http.MethodGet, "/api/talkwise/training/scenario-templates", nil),
	)

	require.Equal(t, http.StatusBadGateway, recorder.Code)
	var response struct {
		Success bool   `json:"success"`
		Code    string `json:"code"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	assert.False(t, response.Success)
	assert.Equal(t, talkWiseTrainingUpstreamUnavailable, response.Code)
}

func TestNormalizeTalkWiseTrainingSuffixRejectsPathTraversal(t *testing.T) {
	for _, suffix := range []string{"/../auth", "/sessions/../../auth", "./sessions"} {
		_, err := normalizeTalkWiseTrainingSuffix(suffix)
		assert.Error(t, err, suffix)
	}
}
