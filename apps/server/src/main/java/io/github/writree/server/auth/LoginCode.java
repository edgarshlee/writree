package io.github.writree.server.auth;

import io.github.writree.server.user.UserAccount;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "login_codes")
public class LoginCode {
    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private UserAccount user;

    @Column(name = "code_hash", nullable = false, unique = true, length = 64)
    private String codeHash;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "consumed_at")
    private Instant consumedAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected LoginCode() {
    }

    public static LoginCode create(UserAccount user, String codeHash, Instant expiresAt) {
        var code = new LoginCode();
        code.id = UUID.randomUUID();
        code.user = user;
        code.codeHash = codeHash;
        code.expiresAt = expiresAt;
        code.createdAt = Instant.now();
        return code;
    }

    public boolean canConsume(Instant now) { return consumedAt == null && expiresAt.isAfter(now); }
    public void consume(Instant now) { consumedAt = now; }
    public UserAccount getUser() { return user; }
}
