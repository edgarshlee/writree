package io.github.writree.server.auth;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class AuthHashTest {
    @Test
    void hashesTokensDeterministicallyWithoutStoringTheToken() {
        String hash = AuthService.hash("raw-refresh-token");
        assertThat(hash).hasSize(64).doesNotContain("raw-refresh-token");
        assertThat(AuthService.hash("raw-refresh-token")).isEqualTo(hash);
    }
}
