#!/bin/sh
# Runs the worked examples with Saxon-HE and writes the outputs next to them.
# SAXON_CP: classpath with Saxon-HE 12.x and xmlresolver 5.x (kept outside the repo).
cd "$(dirname "$0")"
run() { java -cp "$SAXON_CP" net.sf.saxon.Transform "$@"; echo "exit=$? $*"; }
for b in ex1-concat ex2-remove-contexts ex3-create-if ex4-use-one-as-many ex5-statistics-sort; do
  run -s:"$b.xml" -xsl:"$b.xsl" -o:"$b.out.xml"
done
run -it -xsl:checks-queue.xsl -o:checks-queue.out.txt
# ex6: the exported stylesheet alone must fail on the stub; with the hand-written bodies it runs.
run -s:ex6-udf.xml -xsl:ex6-udf.xsl -o:ex6-udf.stub.out.xml; rm -f ex6-udf.stub.out.xml
run -s:ex6-udf.xml -xsl:udf-impl-ex6.xsl -o:ex6-udf.out.xml
