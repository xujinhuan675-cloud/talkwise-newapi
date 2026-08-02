package model

import (
	"errors"
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	TrainingTeamRoleOwner  = "owner"
	TrainingTeamRoleAdmin  = "admin"
	TrainingTeamRoleMember = "member"
)

var (
	ErrTrainingTeamNotFound           = errors.New("training team not found")
	ErrTrainingTeamMemberNotFound     = errors.New("training team member not found")
	ErrTrainingTeamMembershipConflict = errors.New("user already belongs to another training team")
)

// TrainingTeam is a TalkWise product team. It is deliberately independent
// from User.Group, which remains part of NewAPI gateway routing and billing.
type TrainingTeam struct {
	Id           string  `json:"id" gorm:"type:varchar(100);primaryKey"`
	Name         string  `json:"name" gorm:"type:varchar(100);not null;uniqueIndex:ux_training_team_name"`
	LegacyKey    *string `json:"-" gorm:"type:varchar(64);uniqueIndex:ux_training_team_legacy_key"`
	ArchivedTime *int64  `json:"archived_time,omitempty" gorm:"bigint;index:idx_training_team_archived"`
	CreatedTime  int64   `json:"created_time" gorm:"bigint;not null"`
	UpdatedTime  int64   `json:"updated_time" gorm:"bigint;not null"`
}

func (TrainingTeam) TableName() string { return "training_teams" }

// TrainingTeamMembership is the sole source of training team membership.
// ux_training_team_user protects idempotency while ux_training_user_membership
// gives each account one unambiguous active team for the identity bridge.
type TrainingTeamMembership struct {
	Id          int64  `json:"id" gorm:"primaryKey"`
	TeamId      string `json:"team_id" gorm:"type:varchar(100);not null;uniqueIndex:ux_training_team_user,priority:1;index:idx_training_membership_team"`
	UserId      int    `json:"user_id" gorm:"not null;uniqueIndex:ux_training_team_user,priority:2;uniqueIndex:ux_training_user_membership"`
	Role        string `json:"role" gorm:"type:varchar(16);not null;default:'member'"`
	CreatedTime int64  `json:"created_time" gorm:"bigint;not null"`
	UpdatedTime int64  `json:"updated_time" gorm:"bigint;not null"`
}

func (TrainingTeamMembership) TableName() string { return "training_team_memberships" }

type TrainingTeamMemberView struct {
	UserId             int    `json:"user_id" gorm:"column:user_id"`
	Username           string `json:"username"`
	DisplayName        string `json:"display_name" gorm:"column:display_name"`
	Email              string `json:"email"`
	PlatformRole       int    `json:"platform_role" gorm:"column:platform_role"`
	Status             int    `json:"status"`
	GatewayGroup       string `json:"gateway_group" gorm:"column:gateway_group"`
	Quota              int    `json:"quota"`
	UsedQuota          int    `json:"used_quota" gorm:"column:used_quota"`
	RequestCount       int    `json:"request_count" gorm:"column:request_count"`
	TeamRole           string `json:"team_role" gorm:"column:team_role"`
	MembershipTeamId   string `json:"membership_team_id" gorm:"column:membership_team_id"`
	MembershipTeamName string `json:"membership_team_name" gorm:"column:membership_team_name"`
}

func trainingTeamUserGroupColumn() string {
	if common.UsingMainDatabase(common.DatabaseTypePostgreSQL) {
		return `users."group"`
	}
	return "users.`group`"
}

func NormalizeTrainingTeamRole(raw string) (string, error) {
	role := strings.ToLower(strings.TrimSpace(raw))
	if role == "" {
		return TrainingTeamRoleMember, nil
	}
	switch role {
	case TrainingTeamRoleOwner, TrainingTeamRoleAdmin, TrainingTeamRoleMember:
		return role, nil
	default:
		return "", fmt.Errorf("invalid training team role %q", raw)
	}
}

func CreateTrainingTeam(name string) (*TrainingTeam, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, errors.New("training team name is required")
	}
	var existing TrainingTeam
	if err := DB.Where("name = ?", name).First(&existing).Error; err == nil {
		if existing.ArchivedTime == nil {
			return nil, errors.New("training team name already exists")
		}
		now := common.GetTimestamp()
		if err := DB.Model(&existing).Updates(map[string]any{
			"archived_time": nil,
			"updated_time":  now,
		}).Error; err != nil {
			return nil, err
		}
		existing.ArchivedTime = nil
		existing.UpdatedTime = now
		return &existing, nil
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	now := common.GetTimestamp()
	team := &TrainingTeam{
		Id:          "training-team-" + uuid.NewString(),
		Name:        name,
		CreatedTime: now,
		UpdatedTime: now,
	}
	if err := DB.Create(team).Error; err != nil {
		return nil, err
	}
	return team, nil
}

// FindOrCreateLegacyTrainingTeam preserves the existing TalkWise service
// contract without deriving membership from gateway groups. The legacy key is
// only a stable lookup alias for the team resource.
func FindOrCreateLegacyTrainingTeam(legacyKey string) (*TrainingTeam, error) {
	legacyKey = strings.TrimSpace(legacyKey)
	if legacyKey == "" {
		return nil, errors.New("training team legacy key is required")
	}
	var team TrainingTeam
	err := DB.Where("legacy_key = ?", legacyKey).First(&team).Error
	if err == nil {
		if team.ArchivedTime != nil {
			now := common.GetTimestamp()
			if err := DB.Model(&team).Updates(map[string]any{
				"archived_time": nil,
				"updated_time":  now,
			}).Error; err != nil {
				return nil, err
			}
			team.ArchivedTime = nil
			team.UpdatedTime = now
		}
		return &team, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	now := common.GetTimestamp()
	team = TrainingTeam{
		Id:          "newapi:" + legacyKey,
		Name:        legacyKey,
		LegacyKey:   &legacyKey,
		CreatedTime: now,
		UpdatedTime: now,
	}
	if err := DB.Clauses(clause.OnConflict{DoNothing: true}).Create(&team).Error; err != nil {
		return nil, err
	}
	if err := DB.Where("legacy_key = ?", legacyKey).First(&team).Error; err != nil {
		return nil, err
	}
	return &team, nil
}

func GetTrainingTeamById(teamId string) (*TrainingTeam, error) {
	teamId = strings.TrimSpace(teamId)
	if teamId == "" {
		return nil, ErrTrainingTeamNotFound
	}
	var team TrainingTeam
	if err := DB.Where("id = ? AND archived_time IS NULL", teamId).First(&team).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrTrainingTeamNotFound
		}
		return nil, err
	}
	return &team, nil
}

func UpdateTrainingTeam(teamId string, name string) (*TrainingTeam, error) {
	team, err := GetTrainingTeamById(teamId)
	if err != nil {
		return nil, err
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, errors.New("training team name is required")
	}
	team.Name = name
	team.UpdatedTime = common.GetTimestamp()
	if err := DB.Model(team).Select("name", "updated_time").Updates(team).Error; err != nil {
		return nil, err
	}
	return team, nil
}

func DeleteTrainingTeam(teamId string) error {
	teamId = strings.TrimSpace(teamId)
	if teamId == "" {
		return ErrTrainingTeamNotFound
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		var team TrainingTeam
		if err := tx.Where("id = ? AND archived_time IS NULL", teamId).First(&team).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrTrainingTeamNotFound
			}
			return err
		}
		if err := tx.Where("team_id = ?", teamId).Delete(&TrainingTeamMembership{}).Error; err != nil {
			return err
		}
		now := common.GetTimestamp()
		return tx.Model(&team).Updates(map[string]any{
			"archived_time": now,
			"updated_time":  now,
		}).Error
	})
}

func ListTrainingTeams(startIdx int, limit int) ([]TrainingTeam, int64, error) {
	if startIdx < 0 {
		startIdx = 0
	}
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	query := DB.Model(&TrainingTeam{}).Where("archived_time IS NULL")
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var teams []TrainingTeam
	if err := query.Order("name ASC").Offset(startIdx).Limit(limit).Find(&teams).Error; err != nil {
		return nil, 0, err
	}
	return teams, total, nil
}

func GetTrainingTeamForUser(userId int) (*TrainingTeam, *TrainingTeamMembership, error) {
	if userId <= 0 {
		return nil, nil, ErrTrainingTeamMemberNotFound
	}
	var membership TrainingTeamMembership
	if err := DB.Where("user_id = ?", userId).First(&membership).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil, ErrTrainingTeamMemberNotFound
		}
		return nil, nil, err
	}
	team, err := GetTrainingTeamById(membership.TeamId)
	if err != nil {
		return nil, nil, err
	}
	return team, &membership, nil
}

func AddTrainingTeamMember(teamId string, userId int, rawRole string) (*TrainingTeamMembership, error) {
	role, err := NormalizeTrainingTeamRole(rawRole)
	if err != nil {
		return nil, err
	}
	var membership TrainingTeamMembership
	err = DB.Transaction(func(tx *gorm.DB) error {
		var team TrainingTeam
		if err := tx.Select("id").Where("id = ?", strings.TrimSpace(teamId)).First(&team).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrTrainingTeamNotFound
			}
			return err
		}

		// Select only identity and status. Gateway group, quota, balance and
		// billing fields are intentionally outside this transaction.
		var user struct {
			Id     int
			Status int
		}
		if err := tx.Table("users").Select("id", "status").Where("id = ? AND deleted_at IS NULL", userId).Take(&user).Error; err != nil {
			return err
		}
		if user.Status != common.UserStatusEnabled {
			return errors.New("training team user is disabled")
		}

		var existing TrainingTeamMembership
		existingErr := tx.Where("user_id = ?", userId).First(&existing).Error
		if existingErr == nil {
			if existing.TeamId != team.Id {
				return ErrTrainingTeamMembershipConflict
			}
			if existing.Role != role {
				existing.Role = role
				existing.UpdatedTime = common.GetTimestamp()
				if err := tx.Model(&existing).Select("role", "updated_time").Updates(&existing).Error; err != nil {
					return err
				}
			}
			membership = existing
			return nil
		}
		if !errors.Is(existingErr, gorm.ErrRecordNotFound) {
			return existingErr
		}

		now := common.GetTimestamp()
		membership = TrainingTeamMembership{
			TeamId:      team.Id,
			UserId:      user.Id,
			Role:        role,
			CreatedTime: now,
			UpdatedTime: now,
		}
		return tx.Create(&membership).Error
	})
	if err != nil {
		return nil, err
	}
	return &membership, nil
}

func RemoveTrainingTeamMember(teamId string, userId int) error {
	result := DB.Where("team_id = ? AND user_id = ?", strings.TrimSpace(teamId), userId).
		Delete(&TrainingTeamMembership{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrTrainingTeamMemberNotFound
	}
	return nil
}

func ListTrainingTeamMembers(teamId string, startIdx int, limit int) ([]TrainingTeamMemberView, int64, error) {
	if _, err := GetTrainingTeamById(teamId); err != nil {
		return nil, 0, err
	}
	if startIdx < 0 {
		startIdx = 0
	}
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	query := DB.Table("training_team_memberships AS memberships").
		Joins("JOIN users ON users.id = memberships.user_id AND users.deleted_at IS NULL").
		Where("memberships.team_id = ?", teamId)
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var members []TrainingTeamMemberView
	if err := query.Select(
		"users.id AS user_id, users.username, users.display_name, users.email, " +
			"users.role AS platform_role, users.status, " + trainingTeamUserGroupColumn() + " AS gateway_group, " +
			"users.quota, users.used_quota, users.request_count, memberships.role AS team_role, " +
			"memberships.team_id AS membership_team_id, teams.name AS membership_team_name",
	).Joins(
		"JOIN training_teams AS teams ON teams.id = memberships.team_id",
	).Order("users.username ASC").Offset(startIdx).Limit(limit).Scan(&members).Error; err != nil {
		return nil, 0, err
	}
	return members, total, nil
}

func SearchTrainingTeamUsers(teamId string, keyword string, startIdx int, limit int) ([]TrainingTeamMemberView, int64, error) {
	if _, err := GetTrainingTeamById(teamId); err != nil {
		return nil, 0, err
	}
	keyword = strings.TrimSpace(keyword)
	if keyword == "" {
		return nil, 0, errors.New("training team user search keyword is required")
	}
	if startIdx < 0 {
		startIdx = 0
	}
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	like := "%" + keyword + "%"
	query := DB.Table("users").
		Joins("LEFT JOIN training_team_memberships AS memberships ON memberships.user_id = users.id").
		Joins("LEFT JOIN training_teams AS teams ON teams.id = memberships.team_id").
		Where("users.deleted_at IS NULL AND users.status = ?", common.UserStatusEnabled).
		Where("(users.username LIKE ? OR users.email LIKE ? OR users.display_name LIKE ?)", like, like, like)
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var users []TrainingTeamMemberView
	if err := query.Select(
		"users.id AS user_id, users.username, users.display_name, users.email, " +
			"users.role AS platform_role, users.status, " + trainingTeamUserGroupColumn() + " AS gateway_group, " +
			"users.quota, users.used_quota, users.request_count, memberships.role AS team_role, " +
			"memberships.team_id AS membership_team_id, teams.name AS membership_team_name",
	).Order("users.username ASC").Offset(startIdx).Limit(limit).Scan(&users).Error; err != nil {
		return nil, 0, err
	}
	return users, total, nil
}

func GetTrainingTeamMember(teamId string, userId int) (*TrainingTeamMemberView, error) {
	var member TrainingTeamMemberView
	err := DB.Table("training_team_memberships AS memberships").
		Joins("JOIN users ON users.id = memberships.user_id AND users.deleted_at IS NULL").
		Joins("JOIN training_teams AS teams ON teams.id = memberships.team_id").
		Where("memberships.team_id = ? AND memberships.user_id = ?", strings.TrimSpace(teamId), userId).
		Select(
			"users.id AS user_id, users.username, users.display_name, users.email, " +
				"users.role AS platform_role, users.status, " + trainingTeamUserGroupColumn() + " AS gateway_group, " +
				"users.quota, users.used_quota, users.request_count, memberships.role AS team_role, " +
				"memberships.team_id AS membership_team_id, teams.name AS membership_team_name",
		).Take(&member).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrTrainingTeamMemberNotFound
		}
		return nil, err
	}
	return &member, nil
}
