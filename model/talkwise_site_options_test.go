package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMigrateTalkWiseSiteOptionsMaterializesEffectiveDefaults(t *testing.T) {
	db := useFrontendOptionMigrationDB(t)
	require.NoError(t, db.Create(&Option{Key: "Footer", Value: ""}).Error)

	require.NoError(t, MigrateTalkWiseSiteOptions())

	assert.Equal(t, common.DefaultFooter, requireOptionValue(t, db, "Footer"))
	var homePageConfig map[string]any
	require.NoError(
		t,
		common.UnmarshalJsonStr(
			requireOptionValue(t, db, "HomePageConfig"),
			&homePageConfig,
		),
	)
	assert.Equal(t, float64(2), homePageConfig["version"])
	require.NoError(t, MigrateTalkWiseSiteOptions())
}

func TestMigrateTalkWiseSiteOptionsPreservesAdministratorValues(t *testing.T) {
	db := useFrontendOptionMigrationDB(t)
	options := []Option{
		{Key: "Footer", Value: "Custom footer"},
		{Key: "HomePageConfig", Value: `{"version":2,"custom":true}`},
	}
	require.NoError(t, db.Create(&options).Error)

	require.NoError(t, MigrateTalkWiseSiteOptions())

	assert.Equal(t, options[0].Value, requireOptionValue(t, db, "Footer"))
	assert.Equal(t, options[1].Value, requireOptionValue(t, db, "HomePageConfig"))
}
