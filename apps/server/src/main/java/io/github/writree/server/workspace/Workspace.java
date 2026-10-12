package io.github.writree.server.workspace;

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
@Table(name = "workspaces")
public class Workspace {
    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "owner_id", nullable = false)
    private UserAccount owner;

    @Column(nullable = false)
    private String name;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected Workspace() {
    }

    public static Workspace create(UserAccount owner, String name) {
        var workspace = new Workspace();
        workspace.id = UUID.randomUUID();
        workspace.owner = owner;
        workspace.name = name;
        workspace.createdAt = Instant.now();
        workspace.updatedAt = workspace.createdAt;
        return workspace;
    }

    public UUID getId() { return id; }
    public UserAccount getOwner() { return owner; }
    public String getName() { return name; }
    public Instant getUpdatedAt() { return updatedAt; }
}
