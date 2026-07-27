package controller

import (
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

func setupTalkWiseControllerTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	previousDB := model.DB
	previousLogDB := model.LOG_DB
	previousType := common.MainDatabaseType()
	previousSecret := common.SessionSecret
	previousRedirectDomains := constant.TrustedRedirectDomains

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(
		&model.AuthFlow{},
		&model.User{},
		&model.SubscriptionPlan{},
		&model.UserSubscription{},
	))
	model.DB = db
	model.LOG_DB = db
	common.SetMainDatabaseType(common.DatabaseTypeSQLite)
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
