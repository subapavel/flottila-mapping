package io.flottila.mapping.structure;

import java.util.Optional;

/**
 * A WSDL operation with its direction, and the fault's name when the direction is {@link
 * WsdlDirection#FAULT}.
 */
public record WsdlOperation(
    String interfaceName, String operation, WsdlDirection direction, Optional<String> fault) {}
