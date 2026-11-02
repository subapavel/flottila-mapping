package io.flottila.mapping.service;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.quarkus.jackson.ObjectMapperCustomizer;
import io.quarkus.runtime.StartupEvent;
import jakarta.enterprise.event.Observes;
import jakarta.inject.Singleton;
import java.net.InetAddress;
import java.net.UnknownHostException;
import org.eclipse.microprofile.config.Config;
import org.jboss.logging.Logger;

/**
 * The service's configuration that {@code application.properties} cannot express (ADR-0014,
 * ADR-0024): the startup warning for a host beyond loopback, and a strict JSON reader.
 */
@Singleton
public class ServiceConfig implements ObjectMapperCustomizer {

  private static final Logger LOG = Logger.getLogger(ServiceConfig.class);

  void warnAtStartup(@Observes StartupEvent event, Config config) {
    warnUnlessLoopback(config.getValue("quarkus.http.host", String.class));
  }

  /**
   * A key twice in one object fails every request body, so a test run's working copy reaches the
   * engine as the client wrote it (ADR-0011).
   */
  @Override
  public void customize(ObjectMapper objectMapper) {
    objectMapper.enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION);
  }

  /**
   * Logs a warning unless {@code host} is a loopback address: milestone 1 has no authentication. A
   * host that does not resolve is not known to be loopback, so it warns too.
   *
   * @param host the configured {@code quarkus.http.host}
   */
  public static void warnUnlessLoopback(String host) {
    if (!isLoopback(host)) {
      LOG.warnf(
          "quarkus.http.host is %s, not loopback: the service has no authentication and is"
              + " reachable from other hosts",
          host);
    }
  }

  private static boolean isLoopback(String host) {
    try {
      return InetAddress.getByName(host).isLoopbackAddress();
    } catch (UnknownHostException e) {
      return false;
    }
  }
}
