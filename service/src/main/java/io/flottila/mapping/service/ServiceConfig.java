package io.flottila.mapping.service;

import com.fasterxml.jackson.annotation.JsonSetter;
import com.fasterxml.jackson.annotation.Nulls;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.cfg.CoercionAction;
import com.fasterxml.jackson.databind.cfg.CoercionInputShape;
import com.fasterxml.jackson.databind.type.LogicalType;
import io.quarkus.jackson.ObjectMapperCustomizer;
import io.quarkus.runtime.StartupEvent;
import jakarta.enterprise.event.Observes;
import jakarta.inject.Singleton;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.time.DateTimeException;
import java.time.ZoneId;
import org.eclipse.microprofile.config.Config;
import org.jboss.logging.Logger;

/**
 * The service's configuration that {@code application.properties} cannot express (ADR-0014,
 * ADR-0015, ADR-0024): the startup warning for a host beyond loopback, the startup checks of the
 * trace limit and the time zone, and a strict JSON reader.
 */
@Singleton
public class ServiceConfig implements ObjectMapperCustomizer {

  /** The most one trace entry of a test run keeps (ADR-0015, "Trace"). */
  static final String TRACE_LIMIT = "flottila.mapping.trace-limit";

  /** The time zone of the service's runs (#80). */
  static final String TIME_ZONE = "flottila.mapping.time-zone";

  private static final Logger LOG = Logger.getLogger(ServiceConfig.class);

  void warnAtStartup(@Observes StartupEvent event, Config config) {
    warnUnlessLoopback(config.getValue("quarkus.http.host", String.class));
  }

  /**
   * A trace limit below 1 (#53) or a time zone that is none (#80) is a configuration error, so the
   * service does not start.
   */
  void checkAtStartup(@Observes StartupEvent event, Config config) {
    traceLimit(config);
    timeZone(config);
  }

  /**
   * {@value #TIME_ZONE}: the time zone of the service's runs (#80), a {@code ZoneId}, UTC by
   * default. A run's time is taken in it, and the offset of that time is the zone a date without an
   * offset is read in and every date is written in; an export's caller sets it as the processor's
   * implicit time zone.
   *
   * @throws IllegalArgumentException when it names no time zone
   */
  static ZoneId timeZone(Config config) {
    String zone = config.getValue(TIME_ZONE, String.class);
    try {
      return ZoneId.of(zone);
    } catch (DateTimeException none) {
      throw new IllegalArgumentException(
          TIME_ZONE + " is \"" + zone + "\", which is no time zone: " + none.getMessage(), none);
    }
  }

  /**
   * {@value #TRACE_LIMIT}: the most slots, contexts or occurrence records one trace entry of a test
   * run keeps (ADR-0015, "Trace").
   *
   * @throws IllegalArgumentException when it is less than 1
   */
  static int traceLimit(Config config) {
    int limit = config.getValue(TRACE_LIMIT, Integer.class);
    if (limit < 1) {
      throw new IllegalArgumentException(
          TRACE_LIMIT + " is " + limit + ", but a trace limit is at least 1");
    }
    return limit;
  }

  /**
   * A key twice in one object fails every request body, so a test run's working copy reaches the
   * engine as the client wrote it (ADR-0011). A request record binds only as its contract says
   * (ADR-0024): a missing member, a null member or a null bundle entry fails, and a number or a
   * boolean is no string. The null rule alone would refuse a missing member too, as a null one; the
   * missing rule comes first and names it missing. The failures are {@code
   * MismatchedInputException}s, so {@code invalid-request}. A null inside a test run's model is the
   * model's: the tree reader binds no record.
   */
  @Override
  public void customize(ObjectMapper objectMapper) {
    objectMapper.enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION);
    objectMapper.enable(DeserializationFeature.FAIL_ON_MISSING_CREATOR_PROPERTIES);
    objectMapper.setDefaultSetterInfo(JsonSetter.Value.forValueNulls(Nulls.FAIL, Nulls.FAIL));
    objectMapper
        .coercionConfigFor(LogicalType.Textual)
        .setCoercion(CoercionInputShape.Integer, CoercionAction.Fail)
        .setCoercion(CoercionInputShape.Float, CoercionAction.Fail)
        .setCoercion(CoercionInputShape.Boolean, CoercionAction.Fail);
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
