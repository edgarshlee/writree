package io.github.writree.server.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("writree.sync")
public record SyncProperties(long maxDocumentBytes, int revisionRetention, int tombstoneDays) {
}
