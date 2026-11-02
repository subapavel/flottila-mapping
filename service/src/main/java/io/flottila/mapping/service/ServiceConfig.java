package io.flottila.mapping.service;

// stub for red (#28)
/** The service's configuration (ADR-0014, ADR-0024). */
public final class ServiceConfig {

  private ServiceConfig() {}

  /**
   * Logs a warning unless {@code host} is a loopback address: milestone 1 has no authentication.
   *
   * @param host the configured {@code quarkus.http.host}
   */
  public static void warnUnlessLoopback(String host) {
    throw new UnsupportedOperationException("stub for red (#28)");
  }
}
