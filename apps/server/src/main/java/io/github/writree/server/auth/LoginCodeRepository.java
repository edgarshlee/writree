package io.github.writree.server.auth;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface LoginCodeRepository extends JpaRepository<LoginCode, UUID> {
    Optional<LoginCode> findByCodeHash(String codeHash);
    long deleteByExpiresAtBefore(Instant cutoff);
}
