package io.github.writree.server.user;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "user_accounts")
public class UserAccount {
    @Id
    private UUID id;

    @Column(name = "github_id", nullable = false, unique = true)
    private long githubId;

    @Column(name = "github_login", nullable = false)
    private String githubLogin;

    @Column(name = "display_name")
    private String displayName;

    @Column(name = "avatar_url")
    private String avatarUrl;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected UserAccount() {
    }

    public static UserAccount create(long githubId, String githubLogin, String displayName, String avatarUrl) {
        var user = new UserAccount();
        user.id = UUID.randomUUID();
        user.githubId = githubId;
        user.updateProfile(githubLogin, displayName, avatarUrl);
        user.createdAt = Instant.now();
        return user;
    }

    public void updateProfile(String githubLogin, String displayName, String avatarUrl) {
        this.githubLogin = githubLogin;
        this.displayName = displayName;
        this.avatarUrl = avatarUrl;
        this.updatedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public long getGithubId() { return githubId; }
    public String getGithubLogin() { return githubLogin; }
    public String getDisplayName() { return displayName; }
    public String getAvatarUrl() { return avatarUrl; }
}
