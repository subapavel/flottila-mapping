package io.flottila.mapping.runtime;

import io.flottila.mapping.serializer.XmlSerializer;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * A compiled mapping: the projection plan and the tree of executable nodes (ADR-0021). It is
 * immutable, and each run has a frame of its own.
 */
public final class ExecutableMapping {

  private final Projection projection;
  private final int rootSlot;
  private final Node.OfContent root;
  private final int integers;
  private final int strings;

  ExecutableMapping(
      Projection projection, int rootSlot, Node.OfContent root, int integers, int strings) {
    this.projection = projection;
    this.rootSlot = rootSlot;
    this.root = root;
    this.integers = integers;
    this.strings = strings;
  }

  /**
   * One mapping run: reads the source queues from {@code in} in one pass, then writes the target
   * message to {@code out}, its root created once with slot number 1 (ADR-0006). Nothing is written
   * before the whole input has been read. An error after output was written leaves {@code out}
   * undefined; a caller that needs all or nothing buffers it.
   *
   * @param tracer receives the reports of a traced compile; an untraced compile never calls it
   * @throws MalformedInputException when the input is no well-formed XML document, or has a DOCTYPE
   * @throws IOException when {@code out} cannot be written
   * @throws java.util.concurrent.CancellationException when the thread is interrupted
   */
  public void run(InputStream in, OutputStream out, Tracer tracer)
      throws MalformedInputException, IOException {
    Frame frame = new Frame(projection.read(in), tracer, new XmlSerializer(out), integers, strings);
    frame.integers[rootSlot] = 1;
    frame.out.startDocument();
    root.write(frame);
    frame.out.endDocument();
  }
}
