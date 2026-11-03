#!/usr/bin/env bash
# Script test for the refusals of scripts/function-families.java (#69) that
# function-families-test.sh does not reach: a family file that is no JSON, or no object of objects;
# a helper module without core.xsl; an unknown mode. Each exits non-zero and names the file or the
# fault. A null member, which the canonical form allows, merges as it is.
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
tool=$here/../function-families.java
java=${JAVA_HOME:+$JAVA_HOME/bin/}java
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
fails=0
check() { if [ "$2" != "$3" ]; then echo "FAIL $1: expected '$3' got '$2'"; fails=1; else echo "ok   $1"; fi; }
failed() { if [ "$1" = 0 ]; then echo 0; else echo non-zero; fi; }

# catalogue <case> <text>: the generator over one family file delta.json holding <text>; prints the exit
catalogue() {
  mkdir -p "$tmp/$1"
  printf '%s' "$2" > "$tmp/$1/delta.json"
  "$java" "$tool" catalogue "$tmp/$1/out.json" "$tmp/$1/delta.json" > "$tmp/$1/log" 2>&1
  echo $?
}
# refused <case> <text> <message part>: the file is refused, and the message names it and the fault
refused() {
  check "$1: exit" "$(failed "$(catalogue "$1" "$2")")" non-zero
  check "$1: the message names the file" "$(grep -c 'delta\.json' "$tmp/$1/log")" 1
  check "$1: the message names the fault" "$(grep -cF "$3" "$tmp/$1/log")" 1
}

aFamilyFileThatIsNoJsonIsRefused() {
  refused noColon $'{\n  "a" "b"\n}\n' "':' expected"
  refused noComma $'{\n  "a": "b"\n  "c": "d"\n}\n' "',' or '}' expected"
  refused noMemberName $'{\n  a: "b"\n}\n' "a member name expected"
  refused noArrayComma $'{\n  "a": [\n    "b"\n    "c"\n  ]\n}\n' "',' or ']' expected"
  refused controlCharacter $'{\n  "a": "b\tc"\n}\n' "a string expected"
  refused textAfter $'{\n  "a": "b"\n}\nx\n' "the end of the document expected"
  refused number $'{\n  "a": 1\n}\n' "a value expected"
}

aFamilyFileThatIsNoObjectOfObjectsIsRefused() {
  refused array $'[\n  "a"\n]\n' "is no JSON object"
  refused stringEntry $'{\n  "a": "b"\n}\n' "the entry a is no JSON object"
  # an empty object that is no default is left out of the canonical form
  refused emptyObject $'{\n  "a": {\n    "inputs": {}\n  }\n}\n' "not in canonical form"
}

aNullMemberMergesAsItIs() {
  local c=aNullMemberMergesAsItIs
  check "$c: exit" "$(catalogue "$c" $'{\n  "a": {\n    "b": null\n  }\n}\n')" 0
  check "$c: the merge" "$(cat "$tmp/$c/out.json")" $'{\n  "a": {\n    "b": null,\n    "family": "delta"\n  }\n}'
}

aHelperModuleWithoutCoreIsRefused() {
  local c=aHelperModuleWithoutCoreIsRefused
  "$java" "$tool" helper "$tmp/po-runtime.xsl" "$here/function-families/po-runtime/alpha.xsl" > "$tmp/helper.log" 2>&1
  check "$c: exit" "$(failed $?)" non-zero
  check "$c: the message" "$(grep -c 'no core\.xsl among the inputs' "$tmp/helper.log")" 1
  check "$c: no output" "$(test -e "$tmp/po-runtime.xsl" && echo written || echo none)" none
}

anUnknownModeIsRefused() {
  local c=anUnknownModeIsRefused
  "$java" "$tool" catalog "$tmp/x.json" "$here/function-families/catalogue" > "$tmp/mode.log" 2>&1
  check "$c: exit" "$(failed $?)" non-zero
  check "$c: the message" "$(grep -c 'usage: java scripts/function-families.java' "$tmp/mode.log")" 1
}

aFamilyFileThatIsNoJsonIsRefused
aFamilyFileThatIsNoObjectOfObjectsIsRefused
aNullMemberMergesAsItIs
aHelperModuleWithoutCoreIsRefused
anUnknownModeIsRefused
exit $fails
