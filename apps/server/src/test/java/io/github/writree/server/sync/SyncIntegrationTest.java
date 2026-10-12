package io.github.writree.server.sync;

import io.github.writree.server.auth.AuthService;
import io.github.writree.server.user.UserAccount;
import io.github.writree.server.user.UserAccountRepository;
import io.github.writree.server.workspace.Workspace;
import io.github.writree.server.workspace.WorkspaceRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.time.Instant;
import java.util.List;

import static io.github.writree.server.sync.SyncContracts.DocumentChange;
import static io.github.writree.server.sync.SyncContracts.SyncRequest;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@Testcontainers(disabledWithoutDocker = true)
class SyncIntegrationTest {
    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17-alpine")
            .withDatabaseName("writree_test")
            .withUsername("writree")
            .withPassword("writree-test");

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired SyncService syncService;
    @Autowired AuthService authService;
    @Autowired UserAccountRepository users;
    @Autowired WorkspaceRepository workspaces;

    @Test
    void returnsAConflictInsteadOfOverwritingAnotherDevicesRevision() {
        UserAccount user = users.save(UserAccount.create(System.nanoTime(), "sync-test", "Sync Test", null));
        Workspace workspace = workspaces.save(Workspace.create(user, "Docs"));
        String firstContent = "# 첫 번째 장치\n";
        var first = syncService.sync(user.getId(), workspace.getId(), new SyncRequest(
                "device-a",
                null,
                List.of(new DocumentChange(
                        "README.md",
                        firstContent,
                        SyncService.sha256(firstContent),
                        null,
                        false,
                        Instant.now()))));

        String concurrentContent = "# 두 번째 장치\n";
        var concurrent = syncService.sync(user.getId(), workspace.getId(), new SyncRequest(
                "device-b",
                0L,
                List.of(new DocumentChange(
                        "README.md",
                        concurrentContent,
                        SyncService.sha256(concurrentContent),
                        null,
                        false,
                        Instant.now()))));

        assertThat(first.accepted()).hasSize(1);
        assertThat(concurrent.accepted()).isEmpty();
        assertThat(concurrent.conflicts()).singleElement().satisfies(conflict -> {
            assertThat(conflict.remoteContent()).isEqualTo(firstContent);
            assertThat(conflict.remoteRevision()).isEqualTo(1);
        });
        assertThat(concurrent.remoteChanges()).singleElement()
                .extracting(DocumentChange::content)
                .isEqualTo(firstContent);
    }

    @Test
    void rotatesRefreshTokensAndRejectsReuse() {
        UserAccount user = users.save(UserAccount.create(System.nanoTime(), "auth-test", "Auth Test", null));
        String code = authService.createLoginCode(user);
        var first = authService.exchange(code, "device-a", "Test laptop");
        var rotated = authService.refresh(first.refreshToken());

        assertThat(first.accessToken()).isNotBlank();
        assertThat(rotated.refreshToken()).isNotEqualTo(first.refreshToken());
        assertThatThrownBy(() -> authService.refresh(first.refreshToken()))
                .hasMessageContaining("폐기");
        assertThatThrownBy(() -> authService.exchange(code, "device-b", "Other laptop"))
                .hasMessageContaining("이미 사용");
    }

    @Test
    void restoresARevisionAndEnforcesOwnership() {
        UserAccount owner = users.save(UserAccount.create(System.nanoTime(), "history-owner", "Owner", null));
        UserAccount outsider = users.save(UserAccount.create(System.nanoTime() + 1, "history-outsider", "Outsider", null));
        Workspace workspace = workspaces.save(Workspace.create(owner, "History"));
        String original = "# original\n";
        var created = syncService.sync(owner.getId(), workspace.getId(), new SyncRequest(
                "device-a", null, List.of(new DocumentChange(
                "README.md", original, SyncService.sha256(original), null, false, Instant.now()))));
        var firstRevision = created.accepted().getFirst();
        String edited = "# edited\n";
        syncService.sync(owner.getId(), workspace.getId(), new SyncRequest(
                "device-a", created.cursor(), List.of(new DocumentChange(
                "README.md", edited, SyncService.sha256(edited), firstRevision.revision(), false, Instant.now()))));

        var history = syncService.revisions(owner.getId(), firstRevision.documentId());
        assertThat(history).hasSize(2);
        var restored = syncService.restore(owner.getId(), firstRevision.documentId(), firstRevision.id());
        assertThat(restored.revision()).isEqualTo(3);
        assertThat(restored.contentHash()).isEqualTo(SyncService.sha256(original));
        assertThatThrownBy(() -> syncService.revisions(outsider.getId(), firstRevision.documentId()))
                .hasMessageContaining("찾지 못했습니다");
    }
}
