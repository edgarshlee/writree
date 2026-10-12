package io.github.writree.server.web;

import java.util.List;

public record ApiError(String code, String message, String traceId, List<FieldError> fieldErrors) {
    public record FieldError(String field, String message) {
    }
}
