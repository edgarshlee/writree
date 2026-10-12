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
@Table(name = "devices")
public class Device {
    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private UserAccount user;

    @Column(name = "external_id", nullable = false)
    private String externalId;

    @Column(nullable = false)
    private String name;

    @Column(name = "last_seen_at", nullable = false)
    private Instant lastSeenAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected Device() {
    }

    public static Device create(UserAccount user, String externalId, String name) {
        var device = new Device();
        device.id = UUID.randomUUID();
        device.user = user;
        device.externalId = externalId;
        device.name = name;
        device.createdAt = Instant.now();
        device.lastSeenAt = device.createdAt;
        return device;
    }

    public void touch(String name) {
        this.name = name;
        this.lastSeenAt = Instant.now();
    }

    public UUID getId() { return id; }
    public UserAccount getUser() { return user; }
    public String getExternalId() { return externalId; }
}
