package io.flottila.mapping.runtime;

import io.flottila.mapping.ir.Name;
import io.flottila.mapping.xdm.QueueBlock;
import java.io.InputStream;
import java.util.ArrayDeque;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.CancellationException;
import javax.xml.stream.XMLInputFactory;
import javax.xml.stream.XMLStreamConstants;
import javax.xml.stream.XMLStreamException;
import javax.xml.stream.XMLStreamReader;

/**
 * Fills the source queues of a compiled mapping in one StAX pass over the input (ADR-0004): only
 * the element steps the queues name are followed, every other subtree is skipped, and no tree is
 * built. A context opens at each start of its context field, and a value is appended at each
 * occurrence of its field: the text of the element, with references and CDATA resolved. The input
 * is still parsed whole, so it must be well-formed throughout. A DOCTYPE is refused, and no DTD or
 * external entity is ever read.
 *
 * <p>The plan's entries are distinct (field, context) pairs; equal pairs share one queue
 * (ADR-0006). The step trie is built once at compile and only read by a run.
 */
final class Projection {

  /** One queue of the plan: a field by its element steps, and its context by depth. */
  record Queue(List<Name> field, int contextDepth) {}

  /** A node of the trie of element steps. */
  private static final class Step {
    private final String namespace;
    private final String localName;
    private Step[] children = new Step[0];

    /** The queues whose context field this step is: each occurrence opens a context. */
    private int[] contexts = new int[0];

    /** The queues whose field this step is: each occurrence appends its text. */
    private int[] values = new int[0];

    Step(String namespace, String localName) {
      this.namespace = namespace;
      this.localName = localName;
    }

    /** The child step of that name, or {@code null}. */
    Step child(String namespace, String localName) {
      for (Step child : children) {
        if (child.localName.equals(localName) && child.namespace.equals(namespace)) {
          return child;
        }
      }
      return null;
    }

    Step childOrAdd(Name name) {
      Step child = child(name.namespace(), name.localName());
      if (child == null) {
        child = new Step(name.namespace(), name.localName());
        children = Arrays.copyOf(children, children.length + 1);
        children[children.length - 1] = child;
      }
      return child;
    }
  }

  /** Above the root: its one child is the source root. */
  private final Step document = new Step("", "");

  /** What a skipped subtree's elements stand on: it has no children. */
  private final Step skipped = new Step("", "");

  private final int queues;

  /**
   * @param plan the queues, by their index in the frame
   */
  Projection(List<Queue> plan) {
    queues = plan.size();
    for (int k = 0; k < queues; k++) {
      Queue queue = plan.get(k);
      Step step = document;
      for (int depth = 1; depth <= queue.field().size(); depth++) {
        step = step.childOrAdd(queue.field().get(depth - 1));
        if (depth == queue.contextDepth()) {
          step.contexts = append(step.contexts, k);
        }
      }
      step.values = append(step.values, k);
    }
  }

  private static int[] append(int[] indexes, int index) {
    int[] longer = Arrays.copyOf(indexes, indexes.length + 1);
    longer[indexes.length] = index;
    return longer;
  }

  /**
   * The queues of the plan, read from {@code in}.
   *
   * @throws MalformedInputException when the input is no well-formed XML document, or has a DOCTYPE
   * @throws CancellationException when the thread is interrupted
   */
  QueueBlock[] read(InputStream in) throws MalformedInputException {
    QueueBlock.Builder[] builders = new QueueBlock.Builder[queues];
    for (int k = 0; k < queues; k++) {
      builders[k] = new QueueBlock.Builder();
    }
    XMLInputFactory factory = XMLInputFactory.newDefaultFactory();
    factory.setProperty(XMLInputFactory.SUPPORT_DTD, false);
    factory.setProperty(XMLInputFactory.IS_SUPPORTING_EXTERNAL_ENTITIES, false);
    try {
      XMLStreamReader reader = factory.createXMLStreamReader(in);
      try {
        walk(reader, builders);
      } finally {
        reader.close();
      }
    } catch (XMLStreamException e) {
      throw new MalformedInputException(e.getMessage(), e);
    }
    QueueBlock[] blocks = new QueueBlock[queues];
    for (int k = 0; k < queues; k++) {
      blocks[k] = builders[k].build();
    }
    return blocks;
  }

  private void walk(XMLStreamReader reader, QueueBlock.Builder[] builders)
      throws XMLStreamException, MalformedInputException {
    ArrayDeque<Step> open = new ArrayDeque<>();
    open.push(document);
    while (reader.hasNext()) {
      // checked per event, so an interrupt stops the parse before the input is read to its end
      if (Thread.currentThread().isInterrupted()) {
        throw new CancellationException("the mapping run was interrupted while parsing its input");
      }
      switch (reader.next()) {
        case XMLStreamConstants.START_ELEMENT -> {
          Step step = open.peek().child(namespace(reader), reader.getLocalName());
          if (step == null) {
            open.push(skipped);
          } else {
            for (int k : step.contexts) {
              builders[k].newContext();
            }
            if (step.values.length == 0) {
              open.push(step);
            } else {
              // reads up to the element's end tag, which is therefore never seen here
              String value = reader.getElementText();
              for (int k : step.values) {
                builders[k].append(value);
              }
            }
          }
        }
        case XMLStreamConstants.END_ELEMENT -> open.pop();
        case XMLStreamConstants.DTD ->
            // the JDK reader reports a DOCTYPE even with SUPPORT_DTD off (observed)
            throw new MalformedInputException("the input has a DOCTYPE; no DTD is read", null);
        default -> {
          // text between fields, comments, processing instructions and the end of the document
        }
      }
    }
  }

  /** The element's namespace; the reader gives {@code null} for none (observed). */
  private static String namespace(XMLStreamReader reader) {
    String namespace = reader.getNamespaceURI();
    return namespace == null ? "" : namespace;
  }
}
