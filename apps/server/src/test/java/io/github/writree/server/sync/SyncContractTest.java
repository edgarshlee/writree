package io.github.writree.server.sync;

import io.github.writree.server.web.ApiException;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SyncContractTest {
    @Test
    void normalizesPortableMarkdownPaths() {
        assertThat(SyncService.normalizePath("docs\\guide.md")).isEqualTo("docs/guide.md");
        assertThatThrownBy(() -> SyncService.normalizePath("../secret.md")).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> SyncService.normalizePath("assets/photo.png")).isInstanceOf(ApiException.class);
    }

    @Test
    void hashesNormalizedUtf8Content() {
        assertThat(SyncService.sha256("한글\nMarkdown"))
                .hasSize(64)
                .matches("[a-f0-9]{64}");
    }
}
