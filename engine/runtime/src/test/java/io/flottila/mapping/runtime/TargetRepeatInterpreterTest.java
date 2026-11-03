package io.flottila.mapping.runtime;

import static java.nio.charset.StandardCharsets.UTF_8;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.flottila.mapping.ir.AtomicType;
import io.flottila.mapping.ir.AuthoringId;
import io.flottila.mapping.ir.ElementConstructor;
import io.flottila.mapping.ir.Expr;
import io.flottila.mapping.ir.IrVerifier;
import io.flottila.mapping.ir.Name;
import io.flottila.mapping.ir.SourceQueue;
import io.flottila.mapping.ir.TargetDocument;
import io.flottila.mapping.ir.TargetRepeat;
import io.flottila.mapping.ir.TargetSlots;
import io.flottila.mapping.ir.TextConstructor;
import io.flottila.mapping.ir.VarRef;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.OutputStream;
import java.util.List;
import java.util.concurrent.CancellationException;
import org.junit.jupiter.api.Test;

/**
 * The interpreter on {@code TargetRepeat} and on the queue of a source structure field (ADR-0006
 * "Target fields", ADR-0008; #63), with IR built by hand as lowering gives it.
 */
class TargetRepeatInterpreterTest {

  private static final String DECLARATION = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>";
  private static final long UNBOUNDED = Long.MAX_VALUE;
  private static final Name ORDERS = local("Orders");
  private static final Name ORDER = local("Order");
  private static final Name ID = local("Id");
  private static final Name LINE = local("Line");
  private static final Name QTY = local("Qty");
  private static final Name DOC = local("Doc");
  private static final Name ITEM = local("Item");
  private static final Name TWIN = local("Twin");
  private static final AuthoringId T1 = new AuthoringId("t1");
  private static final AuthoringId T2 = new AuthoringId("t2");
  private static final AuthoringId TWIN_ORIGIN = new AuthoringId("/Doc/Item/Twin");

  private static Name local(String name) {
    return new Name("", name);
  }

  private static VarRef integer(String name, AuthoringId origin) {
    return new VarRef(name, AtomicType.INTEGER, origin);
  }

  private static TargetDocument document(Expr... content) {
    TargetDocument document = new TargetDocument("", DOC, "root", List.of(content));
    IrVerifier.verify(document);
    return document;
  }

  /** Item per slot of {@code queue} under the root, with {@code children}. */
  private static TargetSlots items(Expr queue, Expr... children) {
    return new TargetSlots(
        queue,
        integer("root", T1),
        0,
        UNBOUNDED,
        "slot2",
        "value2",
        new ElementConstructor("", ITEM, List.of(children), T1),
        T1);
  }

  /** Qty per slot of the Qty queue in context Line, under the slot number {@code slot3}. */
  private static TargetSlots quantities() {
    return new TargetSlots(
        new SourceQueue(List.of(ORDERS, ORDER, LINE, QTY), 3, new AuthoringId("a2")),
        integer("slot3", T2),
        0,
        UNBOUNDED,
        "slot4",
        "value4",
        new ElementConstructor(
            "",
            QTY,
            List.of(new TextConstructor(new VarRef("value4", AtomicType.STRING, T2), T2)),
            T2),
        T2);
  }

  private static String run(TargetDocument document, String input) throws Exception {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    Interpreter.compile(document, false)
        .run(new ByteArrayInputStream(input.getBytes(UTF_8)), out, new Tracer());
    return out.toString(UTF_8);
  }

  private static final String INPUT =
      "<Orders><Order><Id>o1</Id><Line><Qty>1</Qty></Line><Line><Qty>2</Qty></Line>"
          + "<Line><Qty>3</Qty></Line></Order><Order/><Order><Id>o3</Id>"
          + "<Line><Qty>4</Qty></Line></Order></Orders>";

  /**
   * Twin, 2 copies under each Item: the j-th under Item slot p has the slot number (p - 1) * 2 + j,
   * so Item 1's Twins read Qty contexts 1 and 2, Item 2's contexts 3 and 4. Item is per Order Id,
   * so the Order without one gives no Item.
   */
  @Test
  void theCopiesOfTargetRepeatAreNumberedAcrossItsParentsSlots() throws Exception {
    TargetDocument document =
        document(
            items(
                new SourceQueue(List.of(ORDERS, ORDER, ID), 1, new AuthoringId("a1")),
                new TargetRepeat(
                    2,
                    integer("slot2", TWIN_ORIGIN),
                    "slot3",
                    new ElementConstructor("", TWIN, List.of(quantities()), TWIN_ORIGIN),
                    TWIN_ORIGIN)));

    assertThat(run(document, INPUT))
        .isEqualTo(
            DECLARATION
                + "<Doc><Item><Twin><Qty>1</Qty></Twin><Twin><Qty>2</Qty></Twin></Item>"
                + "<Item><Twin><Qty>3</Qty></Twin><Twin><Qty>4</Qty></Twin></Item></Doc>");
  }

  /**
   * The queue of the structure field Order holds one {@code ""} per occurrence (ADR-0008), so the
   * empty Order makes an Item too, and the descendants of Order are still read for the other queue.
   */
  @Test
  void aStructureFieldsQueueHoldsAnEmptyStringPerOccurrence() throws Exception {
    TargetDocument document =
        document(
            items(
                new SourceQueue(List.of(ORDERS, ORDER), 1, true, new AuthoringId("a1")),
                new TargetSlots(
                    new SourceQueue(List.of(ORDERS, ORDER, ID), 2, new AuthoringId("a2")),
                    integer("slot2", T2),
                    0,
                    1,
                    "slot3",
                    "value3",
                    new ElementConstructor(
                        "",
                        ID,
                        List.of(
                            new TextConstructor(new VarRef("value3", AtomicType.STRING, T2), T2)),
                        T2),
                    T2)));

    assertThat(run(document, INPUT))
        .isEqualTo(
            DECLARATION + "<Doc><Item><Id>o1</Id></Item><Item/><Item><Id>o3</Id></Item></Doc>");
  }

  /** An output that interrupts the thread writing it at its first write. */
  private static final class InterruptingOutput extends OutputStream {

    private final ByteArrayOutputStream bytes = new ByteArrayOutputStream();
    private boolean interrupted;

    @Override
    public void write(int b) {
      interruptOnce();
      bytes.write(b);
    }

    @Override
    public void write(byte[] buffer, int offset, int length) {
      interruptOnce();
      bytes.write(buffer, offset, length);
    }

    private void interruptOnce() {
      if (!interrupted) {
        interrupted = true;
        Thread.currentThread().interrupt();
      }
    }
  }

  /** An interrupt with the first bytes of output stops the loop over copies (ADR-0021). */
  @Test
  void anInterruptStopsTheLoopOverCopies() throws Exception {
    AuthoringId origin = new AuthoringId("/Doc/Twin");
    TargetDocument twins =
        document(
            new TargetRepeat(
                200_000,
                integer("root", origin),
                "slot2",
                new ElementConstructor("", TWIN, List.of(), origin),
                origin));
    String all = DECLARATION + "<Doc>" + "<Twin/>".repeat(200_000) + "</Doc>";
    // witness: without the interrupt the same run writes every copy
    assertThat(run(twins, "<Orders/>")).isEqualTo(all);
    InterruptingOutput out = new InterruptingOutput();

    try {
      assertThatThrownBy(
              () ->
                  Interpreter.compile(twins, false)
                      .run(
                          new ByteArrayInputStream("<Orders/>".getBytes(UTF_8)), out, new Tracer()))
          .isInstanceOf(CancellationException.class);
    } finally {
      Thread.interrupted();
    }

    assertThat(out.bytes.size())
        .as("bytes written by the cancelled run")
        .isLessThan(all.length() / 2);
  }
}
