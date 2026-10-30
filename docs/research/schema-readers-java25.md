# How do we read XSD, WSDL and JSON Schema in Java 25?

Research note for wayfinder ticket #7. Date: 2026-10-30. Feeds the grilling ticket
"What is the structure model?".

## How this was gathered

- **Read**: Maven Central metadata and POMs (`repo1.maven.org`), project repositories and READMEs on
  GitHub, `json-schema.org`. Each claim links its source.
- **Observed**: on this machine, Java `25.0.5.0.3` (HotSpot) and Apache Maven `3.9.11`. Every jar named
  below was resolved with `mvn dependency:get` / `dependency:build-classpath` and inspected with
  `javap` / `jar --describe-module`. Small probe programs (single-file `java Foo.java`) were run
  against a synthetic schema set. Results marked **[observed]** come from those runs; the probe sources
  are not committed.
- **Not reachable from this session** (DNS blocked by the session's network policy):
  `xerces.apache.org`, `attic.apache.org`, `xmlbeans.apache.org`, `www.saxonica.com`, `www.w3.org`,
  `vertx.io`, `openjdk.org`, `eclipse.dev`. Claims that would need those pages are listed as open
  questions instead of being asserted.

### Probe fixtures [observed]

XSD set (all synthetic):

- `main.xsd` (tns `urn:a`) has `xs:include inc.xsd`, `xs:redefine base.xsd` (extends `Addr` with `zip`),
  `xs:import urn:b` with `schemaLocation="b.xsd"`, and a recursive type `Node` (`child` of type
  `a:Node`). It also has a ref to the abstract head `a:Animal`.
- `inc.xsd` declares head `Animal` (abstract) and member `Dog`.
- `b.xsd` (tns `urn:b`) imports `urn:a` **without** `schemaLocation` and declares member `Cat`.

WSDL: a WSDL 1.1 file with two inline `xs:schema` blocks, where `urn:t1` imports `urn:t2` by namespace
only. It was run in both document orders. There is also a WSDL 2.0 file with one inline schema.

JSON Schema: a 2020-12 `main.json` with `$id`, a recursive `"items": {"$ref": "#"}` and a relative
`"$ref": "addr.json"`, pre-registered under its absolute `$id` and not fetched.

---

## 1. XSD readers

### 1.1 JDK built-in (`java.xml`)

- `java.xml` exports `javax.xml.validation` and `javax.xml.catalog`. **[observed]**
  `java --describe-module java.xml`
- The JDK's internal Xerces schema model package `com.sun.org.apache.xerces.internal.xs` is listed as
  `contains` and is not exported. Without `--add-exports`, no XSD component model is reachable from the
  JDK. **[observed]** (same command)
- `javax.xml.catalog.CatalogResolver` implements `EntityResolver`, `XMLResolver`, `URIResolver` and
  `LSResourceResolver`, so a single catalog object can be plugged into every reader below that takes one
  of these. **[observed]** `javap javax.xml.catalog.CatalogResolver`

### 1.2 Apache Xerces2-J (`xerces:xercesImpl`): XML Schema API (`XSModel`)

- Latest on Central: `2.12.2`, published 2022-01-27. Apache-2.0 in the POM.
  https://repo1.maven.org/maven2/xerces/xercesImpl/ ·
  https://repo1.maven.org/maven2/xerces/xercesImpl/2.12.2/xercesImpl-2.12.2.pom
- Class files are major 51 (Java 7). There is no module descriptor and no `Automatic-Module-Name`.
  **[observed]**
- **JPMS**: putting the jar on the module path fails at boot on Java 25 with
  `Module xercesImpl contains package org.w3c.dom.html, module jdk.xml.dom exports package org.w3c.dom.html to xercesImpl`.
  Its transitive `xml-apis:1.4.01` fails the same way with `org.xml.sax` against `java.xml`. Xerces is
  usable only on the class path. **[observed]**
- API shape: `XSLoader.loadURI/loadURIList/loadInputList` returns an `XSModel`. `XSModel` offers
  `getComponents(short)`, `getComponentsByNamespace`, `getTypeDefinition`, `getElementDeclaration` and
  `getSubstitutionGroup(XSElementDeclaration)`. **[observed]** `javap org.apache.xerces.xs.XSModel`
- Probe **[observed]**:
  - include, import and redefine all load; namespaces `[urn:a, XMLSchema, urn:b]`.
  - **Substitution groups**: `getSubstitutionGroup(Animal)` returns `Cat Dog`. This includes the member
    from the imported namespace.
  - **Redefine**: `Addr` is the redefined type (derivation = extension). Its base is renamed to an
    internal name (`Addr_fn3dktizrknc9pi`), so the original component is still present under a
    generated name.
  - **Recursion**: the `child` element's type is the same `Node` object, so the graph is cyclic by
    identity.
- **XSD 1.1 / `xs:override`**: the Central `xercesImpl-2.12.2.jar` has no class whose name contains
  `override`. **[observed]** A separate XSD 1.1 build is published by a third party (eXist-db) as
  `org.exist-db.thirdparty.xerces:xercesImpl:2.12.2:xml-schema-1.1`. It contains
  `org/apache/xerces/impl/xs/traversers/OverrideTransformationManager` and `DOMOverrideImpl`
  **[observed]**, and its POM declares the optional dependencies `java-cup` and `xpath2`.
  https://repo1.maven.org/maven2/org/exist-db/thirdparty/xerces/xercesImpl/2.12.2/
- Source repo: https://github.com/apache/xerces-j. The README covers only build instructions, and the
  page shows no releases.

### 1.3 Apache XmlSchema (`org.apache.ws.xmlschema:xmlschema-core`)

- Latest: `2.3.3`, published 2026-09-25. Apache-2.0 in the parent POM.
  https://repo1.maven.org/maven2/org/apache/ws/xmlschema/xmlschema-core/ ·
  https://repo1.maven.org/maven2/org/apache/ws/xmlschema/xmlschema/2.3.3/xmlschema-2.3.3.pom
- Class files are major 52 (Java 8). It has an OSGi `Bundle-SymbolicName` and no module descriptor; the
  module name is derived automatically. **[observed]**
- Self-description: a "lightweight schema object model". The repo also has an `xmlschema-walker` module
  with documented limits `walker.maxDecisionPoints`, `walker.maxReplayedEvents` and `walker.maxDepth`
  (default 256). https://github.com/apache/ws-xmlschema
- API: `XmlSchemaCollection.read(InputSource|Element|Document|Source|Reader)`,
  `setSchemaResolver(URIResolver)`, `setBaseUri`. The jar has `XmlSchemaInclude` and
  `XmlSchemaRedefine` and no override class. `XmlSchemaElement.getSubstitutionGroup()` returns the
  head **QName** only. **[observed]** `javap`
- Probe **[observed]**:
  - 5 schemas in the collection; `getExternals()` lists Include, Redefine and Import with their
    locations.
  - **Substitution groups**: there is no reverse index. A manual scan for `substitutionGroup=Animal`
    found `Dog Cat`.
  - **Redefine**: `getTypeByQName(Addr)` returns the redefined complex type (`complexContent`).
  - **Recursion**: references are by QName (`child.getSchemaTypeName() = {urn:a}Node`). Resolving the
    name gives the same `Node` object.
- It is the schema model inside Woden (see 2.2).

### 1.4 XSOM (`org.glassfish.jaxb:xsom`), part of Eclipse JAXB RI

- Latest: `4.0.9`, published 2026-05-28. The POM licence is "Eclipse Distribution License - v 1.0",
  which is BSD-3-Clause-style.
  https://repo1.maven.org/maven2/org/glassfish/jaxb/xsom/ ·
  https://github.com/eclipse-ee4j/jaxb-ri/blob/master/jaxb-ri/xsom/LICENSE.md
- Class files are major 55 (Java 11). It is a **named module** `com.sun.xml.xsom`; it requires
  `com.sun.tools.rngdatatype` and `java.xml` and exports `com.sun.xml.xsom`, `.parser`, `.visitor` and
  others. **[observed]**
- API: `XSOMParser.parse(File)` returns an `XSSchemaSet`. A visitor package is available, and
  `setEntityResolver` is the catalog hook. **[observed]** `javap`
- Probe **[observed]**:
  - 3 schemas.
  - **Substitution groups**: `getSubstitutables(Animal)` returns `Animal Cat Dog` (the head is included).
  - **Redefine**: `Addr` reports derivation extension with base `Addr`, but `getRedefinedCount()` is 0.
  - **Recursion**: same object.
- No class whose name contains `override` (XSD 1.1). **[observed]**

### 1.5 Eclipse XSD (`org.eclipse.emf:org.eclipse.xsd`), the XSD Infoset model on EMF

- Latest: `2.23.0`, published 2026-08-24 (bundle `2.23.0.v20260704-1256`). EPL-2.0. Source is in
  `eclipse-emf/org.eclipse.emf` under `plugins/org.eclipse.xsd` (POM `<scm>`).
  https://repo1.maven.org/maven2/org/eclipse/emf/org.eclipse.xsd/ ·
  https://github.com/eclipse-emf/org.eclipse.emf/tree/09588723fd782c3ff2bb932723f37159552418f7/plugins/org.eclipse.xsd
- Class files are major 52. `Automatic-Module-Name: org.eclipse.xsd`. Transitive dependencies resolved
  by Maven: `org.eclipse.emf.ecore 2.43.0`, `org.eclipse.emf.common 2.46.0` and
  `org.eclipse.osgi 3.23.100`. **[observed]**
- API: `XSDSchema` via an EMF `ResourceSet`. It offers `resolveElementDeclaration` and
  `resolveTypeDefinition`, plus `getAllDiagnostics`, `getReferencingDirectives` and
  `getIncorporatedVersions` (includes and redefines). **[observed]** `javap`
- Probe **[observed]**:
  - 0 diagnostics.
  - **Redefine**: `Addr` is an extension whose base is a distinct object (the pre-redefine version).
  - **Recursion**: same object.
  - **Substitution groups**: `getSubstitutionGroup()` on `Animal` returned only `Dog`. `Cat` (declared
    in the imported `b.xsd`, which imports `urn:a` without a location) was missing. The cause was not
    investigated.
- No `override` class. **[observed]**

### 1.6 Apache XMLBeans (`org.apache.xmlbeans:xmlbeans`): compiled `SchemaTypeSystem`

- Latest: `5.4.1`, published 2026-09-16. Apache-2.0.
  https://repo1.maven.org/maven2/org/apache/xmlbeans/xmlbeans/
- Class files are major 52, Multi-Release, with a **named module** `org.apache.xmlbeans` in
  `META-INF/versions/9`. It requires `org.apache.logging.log4j`, `requires static Saxon.HE` and exports
  `org.apache.xmlbeans.impl.schema`. **[observed]**
- The README lists Saxon-HE as optional, for XPath/XQuery. https://github.com/apache/xmlbeans
- API: `XmlBeans.compileXsd(...)` returns a `SchemaTypeSystem` of `SchemaType` /
  `SchemaGlobalElement`. `XmlOptions.setEntityResolver` is the catalog hook. **[observed]**
- Probe **[observed]**:
  - **Substitution groups**: `substitutionGroupMembers(Animal)` returns `Cat Dog`.
  - **Redefine**: `Addr` has element properties `[street, zip]`, so the content is flattened.
  - **Recursion**: same object.
  - Without a provider jar, log4j-api prints `Log4j API could not find a logging provider` on stderr.

### 1.7 XSD-related notes on the specs

- XSD 1.1 adds `xs:override`, and the 1.1 spec deprecates `xs:redefine`. This was **not verified**,
  because `www.w3.org` was unreachable (see open questions).

---

## 2. WSDL readers

### 2.1 WSDL4J (`wsdl4j:wsdl4j`): JSR-110, WSDL 1.1

- Latest `1.6.3`. The Central files are dated 2013-02-27, and `maven-metadata.xml` was last updated
  2017. The POM licence is "CPL".
  https://repo1.maven.org/maven2/wsdl4j/wsdl4j/ ·
  https://repo1.maven.org/maven2/wsdl4j/wsdl4j/1.6.3/wsdl4j-1.6.3.pom
- SourceForge: licence "Common Public License 1.0", last update 2024-05-11.
  https://sourceforge.net/projects/wsdl4j/
- Class files are major 49 (Java 5). It ships its own `javax.wsdl.*` packages and has no module
  descriptor. On the module path, `-version` boots without error. **[observed]**
- **Embedded schemas**: `javax.wsdl.extensions.schema.Schema` exposes the raw DOM `getElement()` plus
  `getImports/getIncludes/getRedefines` (`SchemaReference`). WSDL4J does not build a schema component
  model. `WSDLReader.readWSDL(WSDLLocator)` is the resolution hook. **[observed]** `javap`
- Probe **[observed]**: reading the WSDL 1.1 file worked on Java 25. Feeding each inline schema's
  `Element` to an XmlSchema `XmlSchemaCollection` resolved `t1:Order`, and it did so in both document
  orders, including the namespace-only import between the two inline schemas.

### 2.2 Apache Woden (`org.apache.woden:woden-core`): WSDL 2.0

- Latest `1.0M10`, files dated 2015-09-06. Apache-2.0.
  https://repo1.maven.org/maven2/org/apache/woden/woden-core/1.0M10/ ·
  https://repo1.maven.org/maven2/org/apache/woden/woden/1.0M10/woden-1.0M10.pom
- Class files are major 49, with no module descriptor. Its transitive dependencies are
  `xmlschema-core 2.2.1` and `commons-logging 1.1.1`. **[observed]**
- `https://github.com/apache/woden` returns 404, and the Apache Attic page was unreachable, so the
  project's status is **not verified**.
- Probe **[observed]**: a WSDL 2.0 `description` was read with validation on. The interface operation's
  `getElementDeclaration()` has content model `org.apache.ws.commons.schema`, and its content is an
  `XmlSchemaElement`. In other words, Woden hands back XmlSchema objects for embedded schemas.

### 2.3 Membrane SOA Model (`com.predic8:soa-model-core`)

- Latest `2.2.0`, published 2025-06-02. Apache-2.0 (parent POM).
  https://repo1.maven.org/maven2/com/predic8/soa-model-core/ · https://github.com/membrane/soa-model
- The README says it can "Parse, create or modify a WSDL or XML Schema Document from Java", and it
  also covers WADL. https://github.com/membrane/soa-model
- Class files are major 55. It is **compiled from Groovy** (`Definitions.groovy`), and its POM depends
  on Groovy, `httpclient` and others. It has no module descriptor. **[observed]**
- Jar contents **[observed]**:
  - Packages `com.predic8.wsdl` (root `Definitions`, which is WSDL 1.1 naming) and `com.predic8.schema`
    (its own XSD model).
  - No class name contains `wsdl20`, `redefine` or `override`.
  - Not probed at runtime.

### 2.4 Other routes

- XmlSchema can read any `xs:schema` DOM element (`XmlSchemaCollection.read(Element, String)`), so it
  can serve as the schema half behind WSDL4J (WSDL 1.1) or Woden (WSDL 2.0). **[observed]** (2.1, 2.2)

---

## 3. JSON Schema readers

The current JSON Schema version is **2020-12**. The page names 2019-09 as the previous version and also
lists draft-07, -06 and -04. https://json-schema.org/specification

### 3.1 networknt `json-schema-validator`

- Latest `3.0.8`, published 2026-09-30. Apache-2.0. The `2.0.8` line was also published 2026-10-02, so
  two lines are active.
  https://repo1.maven.org/maven2/com/networknt/json-schema-validator/
- The README describes the library as a "Java implementation of the JSON Schema Core Draft v4, v6, v7,
  v2019-09 and v2020-12 specification". It also supports the OpenAPI 3.0/3.1 dialects. Per the README,
  3.x targets Java 17+ and Jackson 3.x, and 2.x targets Java 8+ and Jackson 2.x. The README reports
  0 failures against the JSON Schema Test Suite, and says that by default the library "will load
  schemas from the classpath and over the internet if needed".
  https://github.com/networknt/json-schema-validator
- `3.0.8` class files are major 61 (Java 17). It is Multi-Release with a **named module**
  `com.networknt.schema`, which requires `tools.jackson.databind` (Jackson 3) and
  `com.fasterxml.jackson.annotation`. **[observed]**
- Its dependency closure is `jackson-databind 3.2.1` with `jackson-annotations 2.22`. When an older
  Jackson 2 `jackson-annotations` (2.20) won on the class path, loading failed with
  `NoClassDefFoundError: com/fasterxml/jackson/annotation/JsonSerializeAs`. **[observed]**
- **Model**: `Schema` exposes `getSchemaNode()` (the raw Jackson `JsonNode`), `getValidators()`
  (`List<KeywordValidator>`), `getSubSchema(NodePath)`, `getRefSchema` and `getParentSchema`. This is a
  compiled validator tree plus the raw JSON, not a typed structure model. **[observed]** `javap`
- Probe **[observed]**:
  - With `SchemaRegistry.Builder.schemas(Map)` pre-registration, the recursive `#` ref and the relative
    `addr.json` ref both resolved, and validation reported both errors.
  - A `schemaIdResolvers(mapPrefix("https://example.test/", "file:…/"))` attempt failed with
    `FileNotFoundException`. The cause was not investigated.

### 3.2 json-sKema (`com.github.erosb:json-sKema`)

- Latest `0.32.0`, published 2026-09-28. MIT.
  https://repo1.maven.org/maven2/com/github/erosb/json-sKema/
- The README says it "implements the draft 2020-12 specification", with "`$dynamicAnchor` and
  `$dynamicRef` support ... partially implemented". It states it is the successor of everit and points
  to everit for draft-04/06/07. It supports pre-registering schemas by URI and loading over HTTP(S) and
  the classpath. https://github.com/erosb/json-sKema ·
  https://raw.githubusercontent.com/erosb/json-sKema/master/README.md
- Class files are major 52. It is written in Kotlin and depends on `kotlin-stdlib` (resolved
  `2.4.20`), `jmail` and `snakeyaml`. It has no module descriptor. **[observed]**
- **Model**: a typed schema tree. `CompositeSchema.getPropertySchemas()`, `getSubschemas()`,
  `ItemsSchema.getItemsSchema()` and `ReferenceSchema.getRef()/getReferredSchema()` are public, along
  with `SchemaVisitor<P>` and `TraversingSchemaVisitor`. **[observed]** `javap`
- Probe **[observed]**:
  - Root properties are `[name, children, addr]`.
  - `addr` is a `ReferenceSchema` to `https://example.test/addr.json`, resolved to properties
    `[street]`.
  - The `items` `$ref` resolves to **the root object itself** (`cycles to root=true`).
  - The validator output carries schema pointer, schema line/column and the dynamic path.

### 3.3 everit-json-schema (`com.github.erosb:everit-json-schema`)

- Latest `1.14.6`, published 2025-05-15. Apache-2.0. It depends on `org.json:json:20250107`, whose POM
  licence is "Public Domain".
  https://repo1.maven.org/maven2/com/github/erosb/everit-json-schema/ ·
  https://repo1.maven.org/maven2/org/json/json/20250107/json-20250107.pom
- The README says it covers "draft-04, draft-06 and draft-07", that it "is currently in maintenance mode
  and superseded by erosb/json-sKema", and that it "won't see any new features".
  https://github.com/everit-org/json-schema
- Class files are major 52, with no module descriptor. **Model**: `ObjectSchema.getPropertySchemas()`
  and `getRequiredProperties()` are public (a typed tree). **[observed]** `javap`

### 3.4 harrel `json-schema` (`dev.harrel:json-schema`)

- Latest `1.9.1`, published 2026-02-27. MIT. `Automatic-Module-Name: dev.harrel.jsonschema`. Class files
  are major 52. **[observed]**
- The README lists Draft 2020-12, 2019-09, 07, 06 and 04, and pluggable JSON providers.
  https://github.com/harrel56/json-schema
- **Model**: `dev.harrel.jsonschema.Schema` is a package-private `final class`, so the library offers
  validation only and exposes no schema model. **[observed]** `javap`

### 3.5 Vert.x JSON Schema (`io.vertx:vertx-json-schema`)

- Latest `5.2.2`, published 2026-10-21. The parent POM `io.vertx:vertx5-parent` lists Apache-2.0 and EPL-1.0 (read from the resolved POM in `~/.m2`). Class files are major 55. It is a **named module**
  `io.vertx.jsonschema`, which `requires transitive io.vertx.core`. **[observed]**
- Its docs list drafts 2020-12, 2019-09, 7 and 4. On `$ref`, they say "this module will not attempt to
  download any referenced sub-schema", so schemas must be put into a `SchemaRepository` beforehand. The
  docs describe no traversal API.
  https://raw.githubusercontent.com/eclipse-vertx/vertx-json-schema/master/src/main/asciidoc/index.adoc

### 3.6 java-json-tools `json-schema-validator` (fge)

- Last release `2.2.14`, 2020-05-27. Dual licensed in the POM: "Lesser General Public License, version 3
  or greater" **and** "Apache Software License, version 2.0".
  https://repo1.maven.org/maven2/com/github/java-json-tools/json-schema-validator/2.2.14/json-schema-validator-2.2.14.pom
  It was not inspected further.

---

## 4. Comparison tables

Legend:

- "obs" means observed in the probe on Java 25.0.5.
- "JPMS" means: named module / `Automatic-Module-Name` / derived only / fails on the module path.
- "Release" is the Central publish date of the latest version.

### 4.1 XSD

| Library | Licence | Latest / release | Class major | JPMS | Component model | Subst. group (obs) | Redefine (obs) | `xs:override` | Recursion (obs) | Catalog hook |
|---|---|---|---|---|---|---|---|---|---|---|
| JDK `java.xml` | GPLv2+CPE (JDK) | 25 | — | `java.xml` | none exported (validation only) | — | — | — | — | `javax.xml.catalog` |
| Xerces-J `XSModel` | Apache-2.0 | 2.12.2 / 2022-01-27 | 51 | **fails** (split pkgs) | yes, resolved components | `Cat Dog` | redefined type; original kept under generated name | not in Central jar; eXist-db 1.1 build has it | same object | `LSResourceResolver` via DOM config (not probed) |
| Apache XmlSchema | Apache-2.0 | 2.3.3 / 2026-09-25 | 52 | derived | yes, QName refs, lazy | QName only; manual scan `Dog Cat` | redefined type returned; `XmlSchemaRedefine` external kept | no class | by QName → same object | `URIResolver` |
| XSOM | EDL-1.0 (BSD-3) | 4.0.9 / 2026-05-28 | 55 | named `com.sun.xml.xsom` | yes, resolved, visitors | `Animal Cat Dog` | extension; `getRedefinedCount()=0` | no class | same object | `EntityResolver` |
| Eclipse XSD (EMF) | EPL-2.0 | 2.23.0 / 2026-08-24 | 52 | AMN `org.eclipse.xsd` | yes, EMF objects + diagnostics | `Dog` only (Cat missing) | extension; base = distinct pre-redefine object | no class | same object | EMF `URIConverter` (not probed) |
| XMLBeans `SchemaTypeSystem` | Apache-2.0 | 5.4.1 / 2026-09-16 | 52 (MR) | named `org.apache.xmlbeans` | yes, compiled types | `Cat Dog` | flattened `[street, zip]` | no class | same object | `EntityResolver` |

### 4.2 WSDL

| Library | Licence | Latest / release | Class major | JPMS | WSDL version | Embedded schema model | Java 25 read (obs) |
|---|---|---|---|---|---|---|---|
| WSDL4J | CPL-1.0 | 1.6.3 / 2013-02-27 | 49 | derived (boots) | 1.1 | raw DOM + references; pair with XmlSchema | yes |
| Apache Woden | Apache-2.0 | 1.0M10 / 2015-09-06 | 49 | derived | 2.0 | XmlSchema 2.2.1 objects | yes |
| Membrane SOA Model | Apache-2.0 | 2.2.0 / 2025-06-02 | 55 | derived | 1.1 (by class naming) | own XSD model (`com.predic8.schema`) | not probed |

### 4.3 JSON Schema

| Library | Licence | Latest / release | Class major | JPMS | Drafts (README/docs) | Traversable model | `$ref` remote default | Notable deps |
|---|---|---|---|---|---|---|---|---|
| networknt 3.x | Apache-2.0 | 3.0.8 / 2026-09-30 | 61 | named `com.networknt.schema` | 4, 6, 7, 2019-09, 2020-12 (+OpenAPI 3.0/3.1) | validator tree + raw `JsonNode` | loads classpath and internet by default (README) | Jackson 3 + jackson-annotations 2.x |
| json-sKema | MIT | 0.32.0 / 2026-09-28 | 52 | derived | 2020-12 only (`$dynamicRef` partial) | **yes**, typed tree + visitors; cycles by identity (obs) | HTTP(S) and classpath supported; pre-registration | kotlin-stdlib |
| everit | Apache-2.0 | 1.14.6 / 2025-05-15 | 52 | derived | 4, 6, 7 (maintenance mode) | yes, typed tree | not checked | org.json (Public Domain) |
| harrel | MIT | 1.9.1 / 2026-02-27 | 52 | AMN `dev.harrel.jsonschema` | 4, 6, 7, 2019-09, 2020-12 | **no** (Schema is package-private) | not checked | pluggable JSON provider |
| Vert.x JSON Schema | Apache-2.0 / EPL-1.0 (parent POM) | 5.2.2 / 2026-10-21 | 55 | named `io.vertx.jsonschema` | 4, 7, 2019-09, 2020-12 | no traversal API documented | never downloads (docs) | vertx-core |
| java-json-tools | LGPL-3.0+ / Apache-2.0 | 2.2.14 / 2020-05-27 | — | — | (not checked) | (not checked) | (not checked) | — |

---

## 5. Open questions for "What is the structure model?"

1. **Resolved graph or source-faithful tree?** The libraries split two ways. Xerces, XSOM, EMF and
   XMLBeans hand back resolved component graphs. XmlSchema keeps QName references and the
   include/import/redefine externals. Which view does the structure model need: the post-composition
   components (what instances look like), the source documents (what the user edits), or both, with a
   link between them?
2. **Redefine semantics**: the libraries disagree on what "the" redefined type is.
   - Xerces keeps the original under a generated name.
   - XMLBeans flattens it.
   - EMF keeps a distinct base object.
   - XSOM reports a redefined count of 0.

   What must the model show for a redefined type, and is `xs:override` (XSD 1.1) in scope at all?
3. **Substitution groups**: should the model materialise the members of each head, including members
   from imported namespaces? XmlSchema needs a scan, EMF missed a cross-namespace member in our probe,
   and XSOM includes the head itself. What is the rule for abstract heads?
4. **Recursion**: every reader returned cycles by object identity, and json-sKema's `$ref: "#"` points
   back at the root. Is the structure model a graph with named back-edges, or a tree expanded to a
   depth limit? What is the limit?
5. **One model for XSD and JSON Schema?** JSON Schema `allOf/oneOf/anyOf`, `$dynamicRef` and
   `additionalProperties` have no direct XSD counterpart, and XSD particles/occurrence/`mixed` have no
   direct JSON Schema counterpart. Are these one IR with dialect-specific nodes, or two models?
6. **Which JSON Schema drafts must be read?** json-sKema covers only 2020-12, and everit only 4/6/7. Is
   2019-09/07 input a requirement, given that OpenAPI 3.0 uses a draft-04/05 subset?
7. **Resolution policy**: every reader offers some hook (catalog, `URIResolver`, pre-registration).
   networknt fetches over the internet by default (README). Must the structure loader be offline-only,
   with an explicit catalog or bundle of files? How are namespace-only imports (no `schemaLocation`)
   resolved?
8. **WSDL**: are WSDL 1.1 and 2.0 both in scope? Should the model keep messages/parts/operations, or
   only the element declarations they point at?
9. **JPMS**: does the engine run on the module path? If so, Xerces (`xercesImpl` / `xml-apis`) is ruled
   out as a module-path dependency (observed boot failure), and several candidates are
   automatic-module-name-only.
10. **Licences to confirm with the owner**:
    - WSDL4J is CPL-1.0. The allowed list names EPL, the successor of CPL, but not CPL itself.
    - The eXist-db XSD 1.1 Xerces build pulls optional `xpath2` and `java-cup`, whose licences are
      unchecked.
  11. **Source positions**: the mapping editor will likely need line/column per node. json-sKema carries
    them (observed in its error output), and XMLBeans can load line numbers. Is source position a
    requirement of the structure model?
12. **Unverified because unreachable from this session**: the Apache Attic status of Woden, the XSD 1.1
    deprecation of `redefine` and the semantics of `override` (W3C), the Saxon-HE schema features
    (Saxonica), and Xerces's own statement on XSD 1.1 releases (xerces.apache.org).
