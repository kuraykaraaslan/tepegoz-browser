/**
 * A GBNF grammar that constrains generation to a single well-formed JSON **object**, so a weak local
 * model physically cannot emit prose, markdown fences, or multiple objects. This removes the most
 * common weak-model failure the Reactor fights (`coerceDecisionShape`); the exact SHAPE is still
 * zod-validated downstream, so a generic "valid JSON object" grammar is enough (a schema-specific
 * grammar is a later refinement). This is the standard llama.cpp JSON grammar, rooted at an object.
 *
 * Pure + `String.raw` so backslashes are literal GBNF (not TS escapes).
 */
const JSON_OBJECT_GBNF = String.raw`
root   ::= object
value  ::= object | array | string | number | ("true" | "false" | "null") ws
object ::= "{" ws ( string ":" ws value ("," ws string ":" ws value)* )? "}" ws
array  ::= "[" ws ( value ("," ws value)* )? "]" ws
string ::= "\"" ( [^"\\\x7F\x00-\x1F] | "\\" (["\\bfnrt/] | "u" [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F]) )* "\"" ws
number ::= ("-"? ([0-9] | [1-9] [0-9]*)) ("." [0-9]+)? ([eE] [-+]? [0-9]+)? ws
ws     ::= | " " | "\n" [ \t]{0,20}
`;

/** GBNF grammar text constraining output to one JSON object (see {@link JSON_OBJECT_GBNF}). */
export function jsonObjectGrammar(): string {
  return JSON_OBJECT_GBNF;
}
