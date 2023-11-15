var EdtfDataType;
/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ "./node_modules/nearley/lib/nearley.js":
/*!*********************************************!*\
  !*** ./node_modules/nearley/lib/nearley.js ***!
  \*********************************************/
/***/ (function(module) {

(function(root, factory) {
    if ( true && module.exports) {
        module.exports = factory();
    } else {
        root.nearley = factory();
    }
}(this, function() {

    function Rule(name, symbols, postprocess) {
        this.id = ++Rule.highestId;
        this.name = name;
        this.symbols = symbols;        // a list of literal | regex class | nonterminal
        this.postprocess = postprocess;
        return this;
    }
    Rule.highestId = 0;

    Rule.prototype.toString = function(withCursorAt) {
        var symbolSequence = (typeof withCursorAt === "undefined")
                             ? this.symbols.map(getSymbolShortDisplay).join(' ')
                             : (   this.symbols.slice(0, withCursorAt).map(getSymbolShortDisplay).join(' ')
                                 + " ● "
                                 + this.symbols.slice(withCursorAt).map(getSymbolShortDisplay).join(' ')     );
        return this.name + " → " + symbolSequence;
    }


    // a State is a rule at a position from a given starting point in the input stream (reference)
    function State(rule, dot, reference, wantedBy) {
        this.rule = rule;
        this.dot = dot;
        this.reference = reference;
        this.data = [];
        this.wantedBy = wantedBy;
        this.isComplete = this.dot === rule.symbols.length;
    }

    State.prototype.toString = function() {
        return "{" + this.rule.toString(this.dot) + "}, from: " + (this.reference || 0);
    };

    State.prototype.nextState = function(child) {
        var state = new State(this.rule, this.dot + 1, this.reference, this.wantedBy);
        state.left = this;
        state.right = child;
        if (state.isComplete) {
            state.data = state.build();
            // Having right set here will prevent the right state and its children
            // form being garbage collected
            state.right = undefined;
        }
        return state;
    };

    State.prototype.build = function() {
        var children = [];
        var node = this;
        do {
            children.push(node.right.data);
            node = node.left;
        } while (node.left);
        children.reverse();
        return children;
    };

    State.prototype.finish = function() {
        if (this.rule.postprocess) {
            this.data = this.rule.postprocess(this.data, this.reference, Parser.fail);
        }
    };


    function Column(grammar, index) {
        this.grammar = grammar;
        this.index = index;
        this.states = [];
        this.wants = {}; // states indexed by the non-terminal they expect
        this.scannable = []; // list of states that expect a token
        this.completed = {}; // states that are nullable
    }


    Column.prototype.process = function(nextColumn) {
        var states = this.states;
        var wants = this.wants;
        var completed = this.completed;

        for (var w = 0; w < states.length; w++) { // nb. we push() during iteration
            var state = states[w];

            if (state.isComplete) {
                state.finish();
                if (state.data !== Parser.fail) {
                    // complete
                    var wantedBy = state.wantedBy;
                    for (var i = wantedBy.length; i--; ) { // this line is hot
                        var left = wantedBy[i];
                        this.complete(left, state);
                    }

                    // special-case nullables
                    if (state.reference === this.index) {
                        // make sure future predictors of this rule get completed.
                        var exp = state.rule.name;
                        (this.completed[exp] = this.completed[exp] || []).push(state);
                    }
                }

            } else {
                // queue scannable states
                var exp = state.rule.symbols[state.dot];
                if (typeof exp !== 'string') {
                    this.scannable.push(state);
                    continue;
                }

                // predict
                if (wants[exp]) {
                    wants[exp].push(state);

                    if (completed.hasOwnProperty(exp)) {
                        var nulls = completed[exp];
                        for (var i = 0; i < nulls.length; i++) {
                            var right = nulls[i];
                            this.complete(state, right);
                        }
                    }
                } else {
                    wants[exp] = [state];
                    this.predict(exp);
                }
            }
        }
    }

    Column.prototype.predict = function(exp) {
        var rules = this.grammar.byName[exp] || [];

        for (var i = 0; i < rules.length; i++) {
            var r = rules[i];
            var wantedBy = this.wants[exp];
            var s = new State(r, 0, this.index, wantedBy);
            this.states.push(s);
        }
    }

    Column.prototype.complete = function(left, right) {
        var copy = left.nextState(right);
        this.states.push(copy);
    }


    function Grammar(rules, start) {
        this.rules = rules;
        this.start = start || this.rules[0].name;
        var byName = this.byName = {};
        this.rules.forEach(function(rule) {
            if (!byName.hasOwnProperty(rule.name)) {
                byName[rule.name] = [];
            }
            byName[rule.name].push(rule);
        });
    }

    // So we can allow passing (rules, start) directly to Parser for backwards compatibility
    Grammar.fromCompiled = function(rules, start) {
        var lexer = rules.Lexer;
        if (rules.ParserStart) {
          start = rules.ParserStart;
          rules = rules.ParserRules;
        }
        var rules = rules.map(function (r) { return (new Rule(r.name, r.symbols, r.postprocess)); });
        var g = new Grammar(rules, start);
        g.lexer = lexer; // nb. storing lexer on Grammar is iffy, but unavoidable
        return g;
    }


    function StreamLexer() {
      this.reset("");
    }

    StreamLexer.prototype.reset = function(data, state) {
        this.buffer = data;
        this.index = 0;
        this.line = state ? state.line : 1;
        this.lastLineBreak = state ? -state.col : 0;
    }

    StreamLexer.prototype.next = function() {
        if (this.index < this.buffer.length) {
            var ch = this.buffer[this.index++];
            if (ch === '\n') {
              this.line += 1;
              this.lastLineBreak = this.index;
            }
            return {value: ch};
        }
    }

    StreamLexer.prototype.save = function() {
      return {
        line: this.line,
        col: this.index - this.lastLineBreak,
      }
    }

    StreamLexer.prototype.formatError = function(token, message) {
        // nb. this gets called after consuming the offending token,
        // so the culprit is index-1
        var buffer = this.buffer;
        if (typeof buffer === 'string') {
            var lines = buffer
                .split("\n")
                .slice(
                    Math.max(0, this.line - 5), 
                    this.line
                );

            var nextLineBreak = buffer.indexOf('\n', this.index);
            if (nextLineBreak === -1) nextLineBreak = buffer.length;
            var col = this.index - this.lastLineBreak;
            var lastLineDigits = String(this.line).length;
            message += " at line " + this.line + " col " + col + ":\n\n";
            message += lines
                .map(function(line, i) {
                    return pad(this.line - lines.length + i + 1, lastLineDigits) + " " + line;
                }, this)
                .join("\n");
            message += "\n" + pad("", lastLineDigits + col) + "^\n";
            return message;
        } else {
            return message + " at index " + (this.index - 1);
        }

        function pad(n, length) {
            var s = String(n);
            return Array(length - s.length + 1).join(" ") + s;
        }
    }

    function Parser(rules, start, options) {
        if (rules instanceof Grammar) {
            var grammar = rules;
            var options = start;
        } else {
            var grammar = Grammar.fromCompiled(rules, start);
        }
        this.grammar = grammar;

        // Read options
        this.options = {
            keepHistory: false,
            lexer: grammar.lexer || new StreamLexer,
        };
        for (var key in (options || {})) {
            this.options[key] = options[key];
        }

        // Setup lexer
        this.lexer = this.options.lexer;
        this.lexerState = undefined;

        // Setup a table
        var column = new Column(grammar, 0);
        var table = this.table = [column];

        // I could be expecting anything.
        column.wants[grammar.start] = [];
        column.predict(grammar.start);
        // TODO what if start rule is nullable?
        column.process();
        this.current = 0; // token index
    }

    // create a reserved token for indicating a parse fail
    Parser.fail = {};

    Parser.prototype.feed = function(chunk) {
        var lexer = this.lexer;
        lexer.reset(chunk, this.lexerState);

        var token;
        while (true) {
            try {
                token = lexer.next();
                if (!token) {
                    break;
                }
            } catch (e) {
                // Create the next column so that the error reporter
                // can display the correctly predicted states.
                var nextColumn = new Column(this.grammar, this.current + 1);
                this.table.push(nextColumn);
                var err = new Error(this.reportLexerError(e));
                err.offset = this.current;
                err.token = e.token;
                throw err;
            }
            // We add new states to table[current+1]
            var column = this.table[this.current];

            // GC unused states
            if (!this.options.keepHistory) {
                delete this.table[this.current - 1];
            }

            var n = this.current + 1;
            var nextColumn = new Column(this.grammar, n);
            this.table.push(nextColumn);

            // Advance all tokens that expect the symbol
            var literal = token.text !== undefined ? token.text : token.value;
            var value = lexer.constructor === StreamLexer ? token.value : token;
            var scannable = column.scannable;
            for (var w = scannable.length; w--; ) {
                var state = scannable[w];
                var expect = state.rule.symbols[state.dot];
                // Try to consume the token
                // either regex or literal
                if (expect.test ? expect.test(value) :
                    expect.type ? expect.type === token.type
                                : expect.literal === literal) {
                    // Add it
                    var next = state.nextState({data: value, token: token, isToken: true, reference: n - 1});
                    nextColumn.states.push(next);
                }
            }

            // Next, for each of the rules, we either
            // (a) complete it, and try to see if the reference row expected that
            //     rule
            // (b) predict the next nonterminal it expects by adding that
            //     nonterminal's start state
            // To prevent duplication, we also keep track of rules we have already
            // added

            nextColumn.process();

            // If needed, throw an error:
            if (nextColumn.states.length === 0) {
                // No states at all! This is not good.
                var err = new Error(this.reportError(token));
                err.offset = this.current;
                err.token = token;
                throw err;
            }

            // maybe save lexer state
            if (this.options.keepHistory) {
              column.lexerState = lexer.save()
            }

            this.current++;
        }
        if (column) {
          this.lexerState = lexer.save()
        }

        // Incrementally keep track of results
        this.results = this.finish();

        // Allow chaining, for whatever it's worth
        return this;
    };

    Parser.prototype.reportLexerError = function(lexerError) {
        var tokenDisplay, lexerMessage;
        // Planning to add a token property to moo's thrown error
        // even on erroring tokens to be used in error display below
        var token = lexerError.token;
        if (token) {
            tokenDisplay = "input " + JSON.stringify(token.text[0]) + " (lexer error)";
            lexerMessage = this.lexer.formatError(token, "Syntax error");
        } else {
            tokenDisplay = "input (lexer error)";
            lexerMessage = lexerError.message;
        }
        return this.reportErrorCommon(lexerMessage, tokenDisplay);
    };

    Parser.prototype.reportError = function(token) {
        var tokenDisplay = (token.type ? token.type + " token: " : "") + JSON.stringify(token.value !== undefined ? token.value : token);
        var lexerMessage = this.lexer.formatError(token, "Syntax error");
        return this.reportErrorCommon(lexerMessage, tokenDisplay);
    };

    Parser.prototype.reportErrorCommon = function(lexerMessage, tokenDisplay) {
        var lines = [];
        lines.push(lexerMessage);
        var lastColumnIndex = this.table.length - 2;
        var lastColumn = this.table[lastColumnIndex];
        var expectantStates = lastColumn.states
            .filter(function(state) {
                var nextSymbol = state.rule.symbols[state.dot];
                return nextSymbol && typeof nextSymbol !== "string";
            });

        if (expectantStates.length === 0) {
            lines.push('Unexpected ' + tokenDisplay + '. I did not expect any more input. Here is the state of my parse table:\n');
            this.displayStateStack(lastColumn.states, lines);
        } else {
            lines.push('Unexpected ' + tokenDisplay + '. Instead, I was expecting to see one of the following:\n');
            // Display a "state stack" for each expectant state
            // - which shows you how this state came to be, step by step.
            // If there is more than one derivation, we only display the first one.
            var stateStacks = expectantStates
                .map(function(state) {
                    return this.buildFirstStateStack(state, []) || [state];
                }, this);
            // Display each state that is expecting a terminal symbol next.
            stateStacks.forEach(function(stateStack) {
                var state = stateStack[0];
                var nextSymbol = state.rule.symbols[state.dot];
                var symbolDisplay = this.getSymbolDisplay(nextSymbol);
                lines.push('A ' + symbolDisplay + ' based on:');
                this.displayStateStack(stateStack, lines);
            }, this);
        }
        lines.push("");
        return lines.join("\n");
    }
    
    Parser.prototype.displayStateStack = function(stateStack, lines) {
        var lastDisplay;
        var sameDisplayCount = 0;
        for (var j = 0; j < stateStack.length; j++) {
            var state = stateStack[j];
            var display = state.rule.toString(state.dot);
            if (display === lastDisplay) {
                sameDisplayCount++;
            } else {
                if (sameDisplayCount > 0) {
                    lines.push('    ^ ' + sameDisplayCount + ' more lines identical to this');
                }
                sameDisplayCount = 0;
                lines.push('    ' + display);
            }
            lastDisplay = display;
        }
    };

    Parser.prototype.getSymbolDisplay = function(symbol) {
        return getSymbolLongDisplay(symbol);
    };

    /*
    Builds a the first state stack. You can think of a state stack as the call stack
    of the recursive-descent parser which the Nearley parse algorithm simulates.
    A state stack is represented as an array of state objects. Within a
    state stack, the first item of the array will be the starting
    state, with each successive item in the array going further back into history.

    This function needs to be given a starting state and an empty array representing
    the visited states, and it returns an single state stack.

    */
    Parser.prototype.buildFirstStateStack = function(state, visited) {
        if (visited.indexOf(state) !== -1) {
            // Found cycle, return null
            // to eliminate this path from the results, because
            // we don't know how to display it meaningfully
            return null;
        }
        if (state.wantedBy.length === 0) {
            return [state];
        }
        var prevState = state.wantedBy[0];
        var childVisited = [state].concat(visited);
        var childResult = this.buildFirstStateStack(prevState, childVisited);
        if (childResult === null) {
            return null;
        }
        return [state].concat(childResult);
    };

    Parser.prototype.save = function() {
        var column = this.table[this.current];
        column.lexerState = this.lexerState;
        return column;
    };

    Parser.prototype.restore = function(column) {
        var index = column.index;
        this.current = index;
        this.table[index] = column;
        this.table.splice(index + 1);
        this.lexerState = column.lexerState;

        // Incrementally keep track of results
        this.results = this.finish();
    };

    // nb. deprecated: use save/restore instead!
    Parser.prototype.rewind = function(index) {
        if (!this.options.keepHistory) {
            throw new Error('set option `keepHistory` to enable rewinding')
        }
        // nb. recall column (table) indicies fall between token indicies.
        //        col 0   --   token 0   --   col 1
        this.restore(this.table[index]);
    };

    Parser.prototype.finish = function() {
        // Return the possible parsings
        var considerations = [];
        var start = this.grammar.start;
        var column = this.table[this.table.length - 1]
        column.states.forEach(function (t) {
            if (t.rule.name === start
                    && t.dot === t.rule.symbols.length
                    && t.reference === 0
                    && t.data !== Parser.fail) {
                considerations.push(t);
            }
        });
        return considerations.map(function(c) {return c.data; });
    };

    function getSymbolLongDisplay(symbol) {
        var type = typeof symbol;
        if (type === "string") {
            return symbol;
        } else if (type === "object") {
            if (symbol.literal) {
                return JSON.stringify(symbol.literal);
            } else if (symbol instanceof RegExp) {
                return 'character matching ' + symbol;
            } else if (symbol.type) {
                return symbol.type + ' token';
            } else if (symbol.test) {
                return 'token matching ' + String(symbol.test);
            } else {
                throw new Error('Unknown symbol type: ' + symbol);
            }
        }
    }

    function getSymbolShortDisplay(symbol) {
        var type = typeof symbol;
        if (type === "string") {
            return symbol;
        } else if (type === "object") {
            if (symbol.literal) {
                return JSON.stringify(symbol.literal);
            } else if (symbol instanceof RegExp) {
                return symbol.toString();
            } else if (symbol.type) {
                return '%' + symbol.type;
            } else if (symbol.test) {
                return '<' + String(symbol.test) + '>';
            } else {
                throw new Error('Unknown symbol type: ' + symbol);
            }
        }
    }

    return {
        Parser: Parser,
        Grammar: Grammar,
        Rule: Rule,
    };

}));


/***/ }),

/***/ "jquery":
/*!*************************!*\
  !*** external "jQuery" ***!
  \*************************/
/***/ ((module) => {

"use strict";
module.exports = window["jQuery"];

/***/ }),

/***/ "./node_modules/edtf/locale-data/index.cjs":
/*!*************************************************!*\
  !*** ./node_modules/edtf/locale-data/index.cjs ***!
  \*************************************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const en = __webpack_require__(/*! ./en-US.json */ "./node_modules/edtf/locale-data/en-US.json")
const es = __webpack_require__(/*! ./es-ES.json */ "./node_modules/edtf/locale-data/es-ES.json")
const de = __webpack_require__(/*! ./de-DE.json */ "./node_modules/edtf/locale-data/de-DE.json")
const fr = __webpack_require__(/*! ./fr-FR.json */ "./node_modules/edtf/locale-data/fr-FR.json")
const it = __webpack_require__(/*! ./it-IT.json */ "./node_modules/edtf/locale-data/it-IT.json")
const ja = __webpack_require__(/*! ./ja-JA.json */ "./node_modules/edtf/locale-data/ja-JA.json")

const alias = (lang, ...regions) => {
  for (let region of regions)
    data[`${lang}-${region}`] = data[lang]
}

const data = { en, es, de, fr, it, ja }

alias('en', 'AU', 'CA', 'GB', 'NZ', 'SA', 'US')
alias('de', 'AT', 'CH', 'DE')
alias('fr', 'CH', 'FR')

module.exports = data


/***/ }),

/***/ "./node_modules/edtf/index.js":
/*!************************************!*\
  !*** ./node_modules/edtf/index.js ***!
  \************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Bitmask: () => (/* reexport safe */ _src_bitmask_js__WEBPACK_IMPORTED_MODULE_2__.Bitmask),
/* harmony export */   Century: () => (/* reexport safe */ _src_types_js__WEBPACK_IMPORTED_MODULE_1__.Century),
/* harmony export */   Date: () => (/* reexport safe */ _src_types_js__WEBPACK_IMPORTED_MODULE_1__.Date),
/* harmony export */   Decade: () => (/* reexport safe */ _src_types_js__WEBPACK_IMPORTED_MODULE_1__.Decade),
/* harmony export */   Interval: () => (/* reexport safe */ _src_types_js__WEBPACK_IMPORTED_MODULE_1__.Interval),
/* harmony export */   List: () => (/* reexport safe */ _src_types_js__WEBPACK_IMPORTED_MODULE_1__.List),
/* harmony export */   Season: () => (/* reexport safe */ _src_types_js__WEBPACK_IMPORTED_MODULE_1__.Season),
/* harmony export */   Set: () => (/* reexport safe */ _src_types_js__WEBPACK_IMPORTED_MODULE_1__.Set),
/* harmony export */   Year: () => (/* reexport safe */ _src_types_js__WEBPACK_IMPORTED_MODULE_1__.Year),
/* harmony export */   "default": () => (/* reexport safe */ _src_edtf_js__WEBPACK_IMPORTED_MODULE_0__.edtf),
/* harmony export */   defaults: () => (/* reexport safe */ _src_parser_js__WEBPACK_IMPORTED_MODULE_3__.defaults),
/* harmony export */   format: () => (/* reexport safe */ _src_format_js__WEBPACK_IMPORTED_MODULE_4__.format),
/* harmony export */   parse: () => (/* reexport safe */ _src_parser_js__WEBPACK_IMPORTED_MODULE_3__.parse)
/* harmony export */ });
/* harmony import */ var _src_edtf_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./src/edtf.js */ "./node_modules/edtf/src/edtf.js");
/* harmony import */ var _src_types_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./src/types.js */ "./node_modules/edtf/src/types.js");
/* harmony import */ var _src_bitmask_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./src/bitmask.js */ "./node_modules/edtf/src/bitmask.js");
/* harmony import */ var _src_parser_js__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./src/parser.js */ "./node_modules/edtf/src/parser.js");
/* harmony import */ var _src_format_js__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./src/format.js */ "./node_modules/edtf/src/format.js");







/***/ }),

/***/ "./node_modules/edtf/src/assert.js":
/*!*****************************************!*\
  !*** ./node_modules/edtf/src/assert.js ***!
  \*****************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   assert: () => (/* binding */ assert),
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__),
/* harmony export */   equal: () => (/* binding */ equal)
/* harmony export */ });
function assert(value, message) {
  return equal(!!value, true, message ||
    `expected "${value}" to be ok`)
}

function equal(actual, expected, message) {
  // eslint-disable-next-line eqeqeq
  if (actual == expected)
    return true

  if (Number.isNaN(actual) && Number.isNaN(expected))
    return true

  throw new Error(message ||
    `expected "${actual}" to equal "${expected}"`)
}

assert.equal = equal

/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (assert);


/***/ }),

/***/ "./node_modules/edtf/src/bitmask.js":
/*!******************************************!*\
  !*** ./node_modules/edtf/src/bitmask.js ***!
  \******************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Bitmask: () => (/* binding */ Bitmask)
/* harmony export */ });
const DAY = /^days?$/i
const MONTH = /^months?$/i
const YEAR = /^years?$/i
const SYMBOL = /^[xX]$/
const SYMBOLS = /[xX]/g
const PATTERN = /^[0-9xXdDmMyY]{8}$/
const YYYYMMDD = 'YYYYMMDD'.split('')
const MAXDAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

const { floor, pow, max, min } = Math


/**
 * Bitmasks are used to set Unspecified, Uncertain and
 * Approximate flags for a Date. The bitmask for one
 * feature corresponds to a numeric value based on the
 * following pattern:
 *
 *           YYYYMMDD
 *           --------
 *   Day     00000011
 *   Month   00001100
 *   Year    11110000
 *
 */
class Bitmask {

  static test(a, b) {
    return this.convert(a) & this.convert(b)
  }

  static convert(value = 0) { // eslint-disable-line complexity
    value = value || 0

    if (value instanceof Bitmask) return value.value

    switch (typeof value) {
    case 'number': return value

    case 'boolean': return value ? Bitmask.YMD : 0

    case 'string':
      if (DAY.test(value)) return Bitmask.DAY
      if (MONTH.test(value)) return Bitmask.MONTH
      if (YEAR.test(value)) return Bitmask.YEAR
      if (PATTERN.test(value)) return Bitmask.compute(value)
      // fall through!

    default:
      throw new Error(`invalid value: ${value}`)
    }
  }

  static compute(value) {
    return value.split('').reduce((memo, c, idx) =>
      (memo | (SYMBOL.test(c) ? pow(2, idx) : 0)), 0)
  }

  static values(mask, digit = 0) {
    let num = Bitmask.numbers(mask, digit).split('')
    let values = [Number(num.slice(0, 4).join(''))]

    if (num.length > 4) values.push(Number(num.slice(4, 6).join('')))
    if (num.length > 6) values.push(Number(num.slice(6, 8).join('')))

    return Bitmask.normalize(values)
  }

  static numbers(mask, digit = 0) {
    return mask.replace(SYMBOLS, digit)
  }

  static normalize(values) {
    if (values.length > 1)
      values[1] = min(11, max(0, values[1] - 1))

    if (values.length > 2)
      values[2] = min(MAXDAYS[values[1]] || NaN, max(1, values[2]))

    return values
  }


  constructor(value = 0) {
    this.value = Bitmask.convert(value)
  }

  test(value = 0) {
    return this.value & Bitmask.convert(value)
  }

  bit(k) {
    return this.value & pow(2, k)
  }

  get day() { return this.test(Bitmask.DAY) }

  get month() { return this.test(Bitmask.MONTH) }

  get year() { return this.test(Bitmask.YEAR) }


  add(value) {
    return (this.value = this.value | Bitmask.convert(value)), this
  }

  set(value = 0) {
    return (this.value = Bitmask.convert(value)), this
  }

  mask(input = YYYYMMDD, offset = 0, symbol = 'X') {
    return input.map((c, idx) => this.bit(offset + idx) ? symbol : c)
  }

  masks(values, symbol = 'X') {
    let offset = 0

    return values.map(value => {
      let mask = this.mask(value.split(''), offset, symbol)
      offset = offset + mask.length

      return mask.join('')
    })
  }

  // eslint-disable-next-line complexity
  max([year, month, day]) {
    if (!year) return []

    year = Number(
      (this.test(Bitmask.YEAR)) ? this.masks([year], '9')[0] : year
    )

    if (!month) return [year]

    month = Number(month) - 1

    switch (this.test(Bitmask.MONTH)) {
    case Bitmask.MONTH:
      month = 11
      break
    case Bitmask.MX:
      month = (month < 9) ? 8 : 11
      break
    case Bitmask.XM:
      month = (month + 1) % 10
      month = (month < 3) ? month + 9 : month - 1
      break
    }

    if (!day) return [year, month]

    day = Number(day)

    switch (this.test(Bitmask.DAY)) {
    case Bitmask.DAY:
      day = MAXDAYS[month]
      break
    case Bitmask.DX:
      day = min(MAXDAYS[month], day + (9 - (day % 10)))
      break
    case Bitmask.XD:
      day = day % 10

      if (month === 1) {
        day = (day === 9 && !leap(year)) ? day + 10 : day + 20

      } else {
        day = (day < 2) ? day + 30 : day + 20
        if (day > MAXDAYS[month]) day = day - 10
      }

      break
    }

    if (month === 1 && day > 28 && !leap(year)) {
      day = 28
    }

    return [year, month, day]
  }

  // eslint-disable-next-line complexity
  min([year, month, day]) {
    if (!year) return []

    year = Number(
      (this.test(Bitmask.YEAR)) ? this.masks([year], '0')[0] : year
    )

    if (month == null) return [year]

    month = Number(month) - 1

    switch (this.test(Bitmask.MONTH)) {
    case Bitmask.MONTH:
    case Bitmask.XM:
      month = 0
      break
    case Bitmask.MX:
      month = (month < 9) ? 0 : 9
      break
    }

    if (!day) return [year, month]

    day = Number(day)

    switch (this.test(Bitmask.DAY)) {
    case Bitmask.DAY:
      day = 1
      break
    case Bitmask.DX:
      day = max(1, floor(day / 10) * 10)
      break
    case Bitmask.XD:
      day = max(1, day % 10)
      break
    }

    return [year, month, day]
  }

  marks(values, symbol = '?') {
    return values
      .map((value, idx) => [
        this.qualified(idx * 2) ? symbol : '',
        value,
        this.qualified(idx * 2 + 1) ? symbol : ''
      ].join(''))
  }

  qualified(idx) { // eslint-disable-line complexity
    switch (idx) {
    case 1:
      return this.value === Bitmask.YEAR ||
        (this.value & Bitmask.YEAR) && !(this.value & Bitmask.MONTH)
    case 2:
      return this.value === Bitmask.MONTH ||
        (this.value & Bitmask.MONTH) && !(this.value & Bitmask.YEAR)
    case 3:
      return this.value === Bitmask.YM
    case 4:
      return this.value === Bitmask.DAY ||
        (this.value & Bitmask.DAY) && (this.value !== Bitmask.YMD)
    case 5:
      return this.value === Bitmask.YMD
    default:
      return false
    }
  }

  qualify(idx) {
    return (this.value = this.value | Bitmask.UA[idx]), this
  }

  toJSON() {
    return this.value
  }

  toString(symbol = 'X') {
    return this.masks(['YYYY', 'MM', 'DD'], symbol).join('-')
  }
}

Bitmask.prototype.is = Bitmask.prototype.test

function leap(year) {
  if (year % 4 > 0) return false
  if (year % 100 > 0) return true
  if (year % 400 > 0) return false
  return true
}

Bitmask.DAY   = Bitmask.D = Bitmask.compute('yyyymmxx')
Bitmask.MONTH = Bitmask.M = Bitmask.compute('yyyyxxdd')
Bitmask.YEAR  = Bitmask.Y = Bitmask.compute('xxxxmmdd')

Bitmask.MD  = Bitmask.M | Bitmask.D
Bitmask.YMD = Bitmask.Y | Bitmask.MD
Bitmask.YM  = Bitmask.Y | Bitmask.M

Bitmask.YYXX = Bitmask.compute('yyxxmmdd')
Bitmask.YYYX = Bitmask.compute('yyyxmmdd')
Bitmask.XXXX = Bitmask.compute('xxxxmmdd')

Bitmask.DX = Bitmask.compute('yyyymmdx')
Bitmask.XD = Bitmask.compute('yyyymmxd')
Bitmask.MX = Bitmask.compute('yyyymxdd')
Bitmask.XM = Bitmask.compute('yyyyxmdd')

/*
 * Map each UA symbol position to a mask.
 *
 *   ~YYYY~-~MM~-~DD~
 *   0    1 2  3 4  5
 */
Bitmask.UA = [
  Bitmask.YEAR,
  Bitmask.YEAR,   // YEAR !DAY
  Bitmask.MONTH,
  Bitmask.YM,
  Bitmask.DAY,    // YEARDAY
  Bitmask.YMD
]


/***/ }),

/***/ "./node_modules/edtf/src/century.js":
/*!******************************************!*\
  !*** ./node_modules/edtf/src/century.js ***!
  \******************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Century: () => (/* binding */ Century)
/* harmony export */ });
/* harmony import */ var _assert_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./assert.js */ "./node_modules/edtf/src/assert.js");
/* harmony import */ var _date_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./date.js */ "./node_modules/edtf/src/date.js");
/* harmony import */ var _interface_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./interface.js */ "./node_modules/edtf/src/interface.js");




const { abs, floor } = Math
const V = new WeakMap()

class Century extends _interface_js__WEBPACK_IMPORTED_MODULE_2__.ExtDateTime {
  constructor(input) {
    super()

    V.set(this, [])

    this.uncertain = false
    this.approximate = false

    switch (typeof input) {
    case 'number':
      this.century = input
      break

    case 'string':
      input = Century.parse(input)

    // eslint-disable-next-line no-fallthrough
    case 'object':
      if (Array.isArray(input))
        input = { values: input }

      {
        ;(0,_assert_js__WEBPACK_IMPORTED_MODULE_0__["default"])(input !== null)
        if (input.type) _assert_js__WEBPACK_IMPORTED_MODULE_0__["default"].equal('Century', input.type)

        ;(0,_assert_js__WEBPACK_IMPORTED_MODULE_0__["default"])(input.values)
        ;(0,_assert_js__WEBPACK_IMPORTED_MODULE_0__["default"])(input.values.length === 1)

        this.century = input.values[0]
        this.uncertain = !!input.uncertain
        this.approximate = !!input.approximate
      }
      break

    case 'undefined':
      this.year = new Date().getUTCFullYear()
      break

    default:
      throw new RangeError('Invalid century value')
    }
  }

  get century() {
    return this.values[0]
  }

  set century(century) {
    century = floor(Number(century))
    ;(0,_assert_js__WEBPACK_IMPORTED_MODULE_0__["default"])(abs(century) < 100, `invalid century: ${century}`)
    this.values[0] = century
  }

  get year() {
    return this.values[0] * 100
  }

  set year(year) {
    this.century = year / 100
  }

  get values() {
    return V.get(this)
  }

  get min() {
    return _date_js__WEBPACK_IMPORTED_MODULE_1__.Date.UTC(this.year, 0)
  }

  get max() {
    return _date_js__WEBPACK_IMPORTED_MODULE_1__.Date.UTC(this.year + 100, 0) - 1
  }

  toEDTF() {
    let century = Century.pad(this.century)

    if (this.uncertain)
      century = century + '?'

    if (this.approximate)
      century = (century + '~').replace(/\?~/, '%')

    return century
  }

  static pad(number) {
    let k = abs(number)
    let sign = (k === number) ? '' : '-'

    if (k < 10)   return `${sign}0${k}`

    return `${number}`
  }
}


/***/ }),

/***/ "./node_modules/edtf/src/date.js":
/*!***************************************!*\
  !*** ./node_modules/edtf/src/date.js ***!
  \***************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Date: () => (/* binding */ Date),
/* harmony export */   pad: () => (/* binding */ pad)
/* harmony export */ });
/* harmony import */ var _assert_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./assert.js */ "./node_modules/edtf/src/assert.js");
/* harmony import */ var _bitmask_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./bitmask.js */ "./node_modules/edtf/src/bitmask.js");
/* harmony import */ var _interface_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./interface.js */ "./node_modules/edtf/src/interface.js");
/* harmony import */ var _mixin_js__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./mixin.js */ "./node_modules/edtf/src/mixin.js");
/* harmony import */ var _format_js__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./format.js */ "./node_modules/edtf/src/format.js");






const { abs } = Math
const { isArray } = Array

const P = new WeakMap()
const U = new WeakMap()
const A = new WeakMap()
const X = new WeakMap()

const PM = [_bitmask_js__WEBPACK_IMPORTED_MODULE_1__.Bitmask.YMD, _bitmask_js__WEBPACK_IMPORTED_MODULE_1__.Bitmask.Y, _bitmask_js__WEBPACK_IMPORTED_MODULE_1__.Bitmask.YM, _bitmask_js__WEBPACK_IMPORTED_MODULE_1__.Bitmask.YMD]

class Date extends globalThis.Date {
  constructor(...args) { // eslint-disable-line complexity
    let precision = 0
    let uncertain, approximate, unspecified

    switch (args.length) {
    case 0:
      break

    case 1:
      switch (typeof args[0]) {
      case 'number':
        break

      case 'string':
        args = [Date.parse(args[0])]

      // eslint-disable-next-line no-fallthrough
      case 'object':
        if (isArray(args[0]))
          args[0] = { values: args[0] }

        {
          let obj = args[0]

          ;(0,_assert_js__WEBPACK_IMPORTED_MODULE_0__["default"])(obj != null)
          if (obj.type) _assert_js__WEBPACK_IMPORTED_MODULE_0__["default"].equal('Date', obj.type)

          if (obj.values && obj.values.length) {
            precision = obj.values.length
            args = obj.values.slice()

            // ECMA Date constructor needs at least two date parts!
            if (args.length < 2) args.push(0)

            if (obj.offset) {
              if (args.length < 3) args.push(1)
              while (args.length < 5) args.push(0)

              // ECMA Date constructor handles overflows so we
              // simply add the offset!
              args[4] = args[4] + obj.offset
            }

            args = [_interface_js__WEBPACK_IMPORTED_MODULE_2__.ExtDateTime.UTC(...args)]
          }

          ({ uncertain, approximate, unspecified } = obj)
        }
        break

      default:
        throw new RangeError('Invalid time value')
      }

      break

    default:
      precision = args.length
    }

    super(...args)

    this.precision = precision

    this.uncertain = uncertain
    this.approximate = approximate
    this.unspecified = unspecified
  }

  set precision(value) {
    P.set(this, (value > 3) ? 0 : Number(value))
  }

  get precision() {
    return P.get(this)
  }

  set uncertain(value) {
    U.set(this, this.bits(value))
  }

  get uncertain() {
    return U.get(this)
  }

  set approximate(value) {
    A.set(this, this.bits(value))
  }

  get approximate() {
    return A.get(this)
  }

  set unspecified(value) {
    X.set(this, new _bitmask_js__WEBPACK_IMPORTED_MODULE_1__.Bitmask(value))
  }

  get unspecified() {
    return X.get(this)
  }

  get atomic() {
    return !(
      this.precision || this.unspecified.value
    )
  }

  get min() {
    // TODO uncertain and approximate

    if (this.unspecified.value && this.year < 0) {
      let values = this.unspecified.max(this.values.map(Date.pad))
      values[0] = -values[0]
      return (new Date({ values })).getTime()
    }

    return this.getTime()
  }

  get max() {
    // TODO uncertain and approximate
    return (this.atomic) ? this.getTime() : this.next().getTime() - 1
  }

  get year() {
    return this.getUTCFullYear()
  }

  get month() {
    return this.getUTCMonth()
  }

  get date() {
    return this.getUTCDate()
  }

  get hours() {
    return this.getUTCHours()
  }

  get minutes() {
    return this.getUTCMinutes()
  }

  get seconds() {
    return this.getUTCSeconds()
  }

  get values() {
    switch (this.precision) {
    case 1:
      return [this.year]
    case 2:
      return [this.year, this.month]
    case 3:
      return [this.year, this.month, this.date]
    default:
      return [
        this.year, this.month, this.date, this.hours, this.minutes, this.seconds
      ]
    }
  }

  /**
   * Returns the next second, day, month, or year, depending on
   * the current date's precision. Uncertain, approximate and
   * unspecified masks are copied.
   */
  next(k = 1) {
    let { values, unspecified, uncertain, approximate } = this

    if (unspecified.value) {
      let bc = values[0] < 0

      values = (k < 0) ^ bc ?
        unspecified.min(values.map(Date.pad)) :
        unspecified.max(values.map(Date.pad))

      if (bc) values[0] = -values[0]
    }

    values.push(values.pop() + k)

    return new Date({ values, unspecified, uncertain, approximate })
  }

  prev(k = 1) {
    return this.next(-k)
  }

  *[Symbol.iterator]() {
    let cur = this

    while (cur <= this.max) {
      yield cur
      cur = cur.next()
    }
  }

  toEDTF() {
    if (!this.precision) return this.toISOString()

    let sign = (this.year < 0) ? '-' : ''
    let values = this.values.map(Date.pad)

    if (this.unspecified.value)
      return sign + this.unspecified.masks(values).join('-')

    if (this.uncertain.value)
      values = this.uncertain.marks(values, '?')

    if (this.approximate.value) {
      values = this.approximate.marks(values, '~')
        .map(value => value.replace(/(~\?)|(\?~)/, '%'))
    }

    return  sign + values.join('-')
  }

  format(...args) {
    return (0,_format_js__WEBPACK_IMPORTED_MODULE_4__.format)(this, ...args)
  }

  static pad(number, idx = 0) {
    if (!idx) { // idx 0 = year, 1 = month, ...
      let k = abs(number)

      if (k < 10)   return `000${k}`
      if (k < 100)  return `00${k}`
      if (k < 1000) return `0${k}`

      return `${k}`
    }

    if (idx === 1) number = number + 1

    return (number < 10) ? `0${number}` : `${number}`
  }

  bits(value) {
    if (value === true)
      value = PM[this.precision]

    return new _bitmask_js__WEBPACK_IMPORTED_MODULE_1__.Bitmask(value)
  }
}

(0,_mixin_js__WEBPACK_IMPORTED_MODULE_3__.mixin)(Date, _interface_js__WEBPACK_IMPORTED_MODULE_2__.ExtDateTime)

const pad = Date.pad


/***/ }),

/***/ "./node_modules/edtf/src/decade.js":
/*!*****************************************!*\
  !*** ./node_modules/edtf/src/decade.js ***!
  \*****************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Decade: () => (/* binding */ Decade)
/* harmony export */ });
/* harmony import */ var _assert_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./assert.js */ "./node_modules/edtf/src/assert.js");
/* harmony import */ var _date_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./date.js */ "./node_modules/edtf/src/date.js");
/* harmony import */ var _interface_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./interface.js */ "./node_modules/edtf/src/interface.js");




const { abs, floor } = Math
const V = new WeakMap()


class Decade extends _interface_js__WEBPACK_IMPORTED_MODULE_2__.ExtDateTime {
  constructor(input) {
    super()

    V.set(this, [])

    this.uncertain = false
    this.approximate = false

    switch (typeof input) {
    case 'number':
      this.decade = input
      break

    case 'string':
      input = Decade.parse(input)

    // eslint-disable-next-line no-fallthrough
    case 'object':
      if (Array.isArray(input))
        input = { values: input }

      {
        ;(0,_assert_js__WEBPACK_IMPORTED_MODULE_0__["default"])(input !== null)
        if (input.type) _assert_js__WEBPACK_IMPORTED_MODULE_0__["default"].equal('Decade', input.type)

        ;(0,_assert_js__WEBPACK_IMPORTED_MODULE_0__["default"])(input.values)
        ;(0,_assert_js__WEBPACK_IMPORTED_MODULE_0__["default"])(input.values.length === 1)

        this.decade = input.values[0]
        this.uncertain = !!input.uncertain
        this.approximate = !!input.approximate
      }
      break

    case 'undefined':
      this.year = new Date().getUTCFullYear()
      break

    default:
      throw new RangeError('Invalid decade value')
    }
  }

  get decade() {
    return this.values[0]
  }

  set decade(decade) {
    decade = floor(Number(decade))
    ;(0,_assert_js__WEBPACK_IMPORTED_MODULE_0__["default"])(abs(decade) < 1000, `invalid decade: ${decade}`)
    this.values[0] = decade
  }

  get year() {
    return this.values[0] * 10
  }

  set year(year) {
    this.decade = year / 10
  }

  get values() {
    return V.get(this)
  }

  get min() {
    return _date_js__WEBPACK_IMPORTED_MODULE_1__.Date.UTC(this.year, 0)
  }

  get max() {
    return _date_js__WEBPACK_IMPORTED_MODULE_1__.Date.UTC(this.year + 10, 0) - 1
  }

  toEDTF() {
    let decade = Decade.pad(this.decade)

    if (this.uncertain)
      decade = decade + '?'

    if (this.approximate)
      decade = (decade + '~').replace(/\?~/, '%')

    return decade
  }

  static pad(number) {
    let k = abs(number)
    let sign = (k === number) ? '' : '-'

    if (k < 10)   return `${sign}00${k}`
    if (k < 100)  return `${sign}0${k}`

    return `${number}`
  }
}


/***/ }),

/***/ "./node_modules/edtf/src/edtf.js":
/*!***************************************!*\
  !*** ./node_modules/edtf/src/edtf.js ***!
  \***************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   edtf: () => (/* binding */ edtf)
/* harmony export */ });
/* harmony import */ var _types_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./types.js */ "./node_modules/edtf/src/types.js");
/* harmony import */ var _parser_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./parser.js */ "./node_modules/edtf/src/parser.js");



const UNIX_TIME = /^\d{5,}$/

function edtf(...args) {
  if (!args.length)
    return new _types_js__WEBPACK_IMPORTED_MODULE_0__.Date()

  if (args.length === 1) {
    switch (typeof args[0]) {
    case 'object':
      return new (_types_js__WEBPACK_IMPORTED_MODULE_0__[args[0].type] || _types_js__WEBPACK_IMPORTED_MODULE_0__.Date)(args[0])
    case 'number':
      return new _types_js__WEBPACK_IMPORTED_MODULE_0__.Date(args[0])
    case 'string':
      if ((UNIX_TIME).test(args[0]))
        return new _types_js__WEBPACK_IMPORTED_MODULE_0__.Date(Number(args[0]))
    }
  }

  let res = (0,_parser_js__WEBPACK_IMPORTED_MODULE_1__.parse)(...args)
  return new _types_js__WEBPACK_IMPORTED_MODULE_0__[res.type](res)
}


/***/ }),

/***/ "./node_modules/edtf/src/format.js":
/*!*****************************************!*\
  !*** ./node_modules/edtf/src/format.js ***!
  \*****************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   format: () => (/* binding */ format),
/* harmony export */   getFormat: () => (/* binding */ getFormat)
/* harmony export */ });
/* harmony import */ var _locale_data_index_cjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../locale-data/index.cjs */ "./node_modules/edtf/locale-data/index.cjs");


const { assign } = Object

const noTime = {
  timeZone: 'UTC',
  timeZoneName: undefined,
  hour: undefined,
  minute: undefined,
  second: undefined
}

const DEFAULTS = [
  {},
  assign({ weekday: undefined, day: undefined, month: undefined }, noTime),
  assign({ weekday: undefined, day: undefined }, noTime),
  assign({}, noTime),
]


function getCacheId(...args) {
  let id = []

  for (let arg of args) {
    if (arg && typeof arg === 'object') {
      id.push(getOrderedProps(arg))
    } else {
      id.push(arg)
    }
  }

  return JSON.stringify(id)

}

function getOrderedProps(obj) {
  let props = []
  let keys = Object.getOwnPropertyNames(obj)

  for (let key of keys.sort()) {
    props.push({ [key]: obj[key] })
  }

  return props
}

function getFormat(date, locale, options) {
  let opts = {}

  switch (date.precision) {
  case 3:
    opts.day = 'numeric'
    // eslint-disable-next-line no-fallthrough
  case 2:
    opts.month = 'numeric'
    // eslint-disable-next-line no-fallthrough
  case 1:
    opts.year = 'numeric'
    break
  }

  assign(opts, options, DEFAULTS[date.precision])

  let id = getCacheId(locale, opts)

  if (!format.cache.has(id)) {
    format.cache.set(id, new Intl.DateTimeFormat(locale, opts))
  }

  return format.cache.get(id)
}

function getPatternsFor(fmt) {
  const { locale, weekday, month, year } = fmt.resolvedOptions()
  const lc = _locale_data_index_cjs__WEBPACK_IMPORTED_MODULE_0__[locale]

  if (lc == null) return null

  const variant = (weekday || month === 'long') ? 'long' :
    (!month || year === '2-digit') ? 'short' : 'medium'

  return {
    approximate: lc.date.approximate[variant],
    uncertain: lc.date.uncertain[variant]
  }
}

function isDMY(type) {
  return type === 'day' || type === 'month' || type === 'year'
}

function mask(date, parts) {
  let string = ''

  for (let { type, value } of parts) {
    string += (isDMY(type) && date.unspecified.is(type)) ?
      value.replace(/./g, 'X') :
      value
  }

  return string
}

function format(date, locale = 'en-US', options = {}) {
  const fmt = getFormat(date, locale, options)
  const pat = getPatternsFor(fmt)

  if (!date.isEDTF || pat == null) {
    return fmt.format(date)
  }

  let string = (!date.unspecified.value || !fmt.formatToParts) ?
    fmt.format(date) :
    mask(date, fmt.formatToParts(date))


  if (date.approximate.value) {
    string = pat.approximate.replace('%D', string)
  }

  if (date.uncertain.value) {
    string = pat.uncertain.replace('%D', string)
  }

  return string
}

format.cache = new Map()


/***/ }),

/***/ "./node_modules/edtf/src/grammar.js":
/*!******************************************!*\
  !*** ./node_modules/edtf/src/grammar.js ***!
  \******************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _util_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./util.js */ "./node_modules/edtf/src/util.js");
/* harmony import */ var _bitmask_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./bitmask.js */ "./node_modules/edtf/src/bitmask.js");
// Generated automatically by nearley, version 2.20.1
// http://github.com/Hardmath123/nearley
function id(x) { return x[0]; }

  

  

  const {
    DAY, MONTH, YEAR, YMD, YM, MD, YYXX, YYYX, XXXX
  } = _bitmask_js__WEBPACK_IMPORTED_MODULE_1__.Bitmask
let Lexer = undefined;
let ParserRules = [
    {"name": "edtf", "symbols": ["L0"], "postprocess": id},
    {"name": "edtf", "symbols": ["L1"], "postprocess": id},
    {"name": "edtf", "symbols": ["L2"], "postprocess": id},
    {"name": "edtf", "symbols": ["L3"], "postprocess": id},
    {"name": "L0", "symbols": ["date_time"], "postprocess": id},
    {"name": "L0", "symbols": ["century"], "postprocess": id},
    {"name": "L0", "symbols": ["L0i"], "postprocess": id},
    {"name": "L0i", "symbols": ["date_time", {"literal":"/"}, "date_time"], "postprocess": (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.interval)(0)},
    {"name": "century", "symbols": ["positive_century"], "postprocess": data => (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.century)(data[0])},
    {"name": "century$string$1", "symbols": [{"literal":"0"}, {"literal":"0"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "century", "symbols": ["century$string$1"], "postprocess": data => (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.century)(0)},
    {"name": "century", "symbols": [{"literal":"-"}, "positive_century"], "postprocess": data => (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.century)(-data[1])},
    {"name": "positive_century", "symbols": ["positive_digit", "digit"], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.num},
    {"name": "positive_century", "symbols": [{"literal":"0"}, "positive_digit"], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.num},
    {"name": "date_time", "symbols": ["date"], "postprocess": id},
    {"name": "date_time", "symbols": ["datetime"], "postprocess": id},
    {"name": "date", "symbols": ["year"], "postprocess": data => (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.date)(data)},
    {"name": "date", "symbols": ["year_month"], "postprocess": data => (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.date)(data[0])},
    {"name": "date", "symbols": ["year_month_day"], "postprocess": data => (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.date)(data[0])},
    {"name": "year", "symbols": ["positive_year"], "postprocess": id},
    {"name": "year", "symbols": ["negative_year"], "postprocess": id},
    {"name": "year$string$1", "symbols": [{"literal":"0"}, {"literal":"0"}, {"literal":"0"}, {"literal":"0"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "year", "symbols": ["year$string$1"], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.join},
    {"name": "positive_year", "symbols": ["positive_digit", "digit", "digit", "digit"], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.join},
    {"name": "positive_year", "symbols": [{"literal":"0"}, "positive_digit", "digit", "digit"], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.join},
    {"name": "positive_year$string$1", "symbols": [{"literal":"0"}, {"literal":"0"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "positive_year", "symbols": ["positive_year$string$1", "positive_digit", "digit"], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.join},
    {"name": "positive_year$string$2", "symbols": [{"literal":"0"}, {"literal":"0"}, {"literal":"0"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "positive_year", "symbols": ["positive_year$string$2", "positive_digit"], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.join},
    {"name": "negative_year", "symbols": [{"literal":"-"}, "positive_year"], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.join},
    {"name": "year_month", "symbols": ["year", {"literal":"-"}, "month"], "postprocess": (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.pick)(0, 2)},
    {"name": "year_month_day", "symbols": ["year", {"literal":"-"}, "month_day"], "postprocess": (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.pick)(0, 2)},
    {"name": "month", "symbols": ["d01_12"], "postprocess": id},
    {"name": "month_day", "symbols": ["m31", {"literal":"-"}, "day"], "postprocess": (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.pick)(0, 2)},
    {"name": "month_day", "symbols": ["m30", {"literal":"-"}, "d01_30"], "postprocess": (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.pick)(0, 2)},
    {"name": "month_day$string$1", "symbols": [{"literal":"0"}, {"literal":"2"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "month_day", "symbols": ["month_day$string$1", {"literal":"-"}, "d01_29"], "postprocess": (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.pick)(0, 2)},
    {"name": "day", "symbols": ["d01_31"], "postprocess": id},
    {"name": "datetime$ebnf$1$subexpression$1", "symbols": ["timezone"], "postprocess": id},
    {"name": "datetime$ebnf$1", "symbols": ["datetime$ebnf$1$subexpression$1"], "postprocess": id},
    {"name": "datetime$ebnf$1", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "datetime", "symbols": ["year_month_day", {"literal":"T"}, "time", "datetime$ebnf$1"], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.datetime},
    {"name": "time", "symbols": ["hours", {"literal":":"}, "minutes", {"literal":":"}, "seconds", "milliseconds"], "postprocess": (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.pick)(0, 2, 4, 5)},
    {"name": "time", "symbols": ["hours", {"literal":":"}, "minutes"], "postprocess": (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.pick)(0, 2)},
    {"name": "time$string$1", "symbols": [{"literal":"2"}, {"literal":"4"}, {"literal":":"}, {"literal":"0"}, {"literal":"0"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "time$ebnf$1$string$1", "symbols": [{"literal":":"}, {"literal":"0"}, {"literal":"0"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "time$ebnf$1", "symbols": ["time$ebnf$1$string$1"], "postprocess": id},
    {"name": "time$ebnf$1", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "time", "symbols": ["time$string$1", "time$ebnf$1"], "postprocess": () => [24, 0, 0]},
    {"name": "hours", "symbols": ["d00_23"], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.num},
    {"name": "minutes", "symbols": ["d00_59"], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.num},
    {"name": "seconds", "symbols": ["d00_59"], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.num},
    {"name": "milliseconds", "symbols": []},
    {"name": "milliseconds", "symbols": [{"literal":"."}, "d3"], "postprocess": data => (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.num)(data.slice(1))},
    {"name": "timezone", "symbols": [{"literal":"Z"}], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.zero},
    {"name": "timezone$subexpression$1", "symbols": [{"literal":"-"}]},
    {"name": "timezone$subexpression$1", "symbols": [{"literal":"−"}]},
    {"name": "timezone", "symbols": ["timezone$subexpression$1", "offset"], "postprocess": data => -data[1]},
    {"name": "timezone", "symbols": [{"literal":"+"}, "positive_offset"], "postprocess": (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.pick)(1)},
    {"name": "positive_offset", "symbols": ["offset"], "postprocess": id},
    {"name": "positive_offset$string$1", "symbols": [{"literal":"0"}, {"literal":"0"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "positive_offset$ebnf$1", "symbols": [{"literal":":"}], "postprocess": id},
    {"name": "positive_offset$ebnf$1", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "positive_offset$string$2", "symbols": [{"literal":"0"}, {"literal":"0"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "positive_offset", "symbols": ["positive_offset$string$1", "positive_offset$ebnf$1", "positive_offset$string$2"], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.zero},
    {"name": "positive_offset$subexpression$1$string$1", "symbols": [{"literal":"1"}, {"literal":"2"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "positive_offset$subexpression$1", "symbols": ["positive_offset$subexpression$1$string$1"]},
    {"name": "positive_offset$subexpression$1$string$2", "symbols": [{"literal":"1"}, {"literal":"3"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "positive_offset$subexpression$1", "symbols": ["positive_offset$subexpression$1$string$2"]},
    {"name": "positive_offset$ebnf$2", "symbols": [{"literal":":"}], "postprocess": id},
    {"name": "positive_offset$ebnf$2", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "positive_offset", "symbols": ["positive_offset$subexpression$1", "positive_offset$ebnf$2", "minutes"], "postprocess": data => (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.num)(data[0]) * 60 + data[2]},
    {"name": "positive_offset$string$3", "symbols": [{"literal":"1"}, {"literal":"4"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "positive_offset$ebnf$3", "symbols": [{"literal":":"}], "postprocess": id},
    {"name": "positive_offset$ebnf$3", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "positive_offset$string$4", "symbols": [{"literal":"0"}, {"literal":"0"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "positive_offset", "symbols": ["positive_offset$string$3", "positive_offset$ebnf$3", "positive_offset$string$4"], "postprocess": () => 840},
    {"name": "positive_offset", "symbols": ["d00_14"], "postprocess": data => (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.num)(data[0]) * 60},
    {"name": "offset$ebnf$1", "symbols": [{"literal":":"}], "postprocess": id},
    {"name": "offset$ebnf$1", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "offset", "symbols": ["d01_11", "offset$ebnf$1", "minutes"], "postprocess": data => (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.num)(data[0]) * 60 + data[2]},
    {"name": "offset$string$1", "symbols": [{"literal":"0"}, {"literal":"0"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "offset$ebnf$2", "symbols": [{"literal":":"}], "postprocess": id},
    {"name": "offset$ebnf$2", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "offset", "symbols": ["offset$string$1", "offset$ebnf$2", "d01_59"], "postprocess": data => (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.num)(data[2])},
    {"name": "offset$string$2", "symbols": [{"literal":"1"}, {"literal":"2"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "offset$ebnf$3", "symbols": [{"literal":":"}], "postprocess": id},
    {"name": "offset$ebnf$3", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "offset$string$3", "symbols": [{"literal":"0"}, {"literal":"0"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "offset", "symbols": ["offset$string$2", "offset$ebnf$3", "offset$string$3"], "postprocess": () => 720},
    {"name": "offset", "symbols": ["d01_12"], "postprocess": data => (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.num)(data[0]) * 60},
    {"name": "L1", "symbols": ["L1d"], "postprocess": id},
    {"name": "L1", "symbols": ["L1Y"], "postprocess": id},
    {"name": "L1", "symbols": ["L1S"], "postprocess": id},
    {"name": "L1", "symbols": ["L1i"], "postprocess": id},
    {"name": "L1d", "symbols": ["date_ua"], "postprocess": id},
    {"name": "L1d", "symbols": ["L1X"], "postprocess": (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.merge)(0, { type: 'Date', level: 1 })},
    {"name": "date_ua", "symbols": ["date", "UA"], "postprocess": (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.merge)(0, 1, { level: 1 })},
    {"name": "L1i", "symbols": ["L1i_date", {"literal":"/"}, "L1i_date"], "postprocess": (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.interval)(1)},
    {"name": "L1i", "symbols": ["date_time", {"literal":"/"}, "L1i_date"], "postprocess": (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.interval)(1)},
    {"name": "L1i", "symbols": ["L1i_date", {"literal":"/"}, "date_time"], "postprocess": (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.interval)(1)},
    {"name": "L1i_date", "symbols": [], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.nothing},
    {"name": "L1i_date", "symbols": ["date_ua"], "postprocess": id},
    {"name": "L1i_date", "symbols": ["INFINITY"], "postprocess": id},
    {"name": "INFINITY$string$1", "symbols": [{"literal":"."}, {"literal":"."}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "INFINITY", "symbols": ["INFINITY$string$1"], "postprocess": () => Infinity},
    {"name": "L1X$string$1", "symbols": [{"literal":"-"}, {"literal":"X"}, {"literal":"X"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "L1X", "symbols": ["nd4", {"literal":"-"}, "md", "L1X$string$1"], "postprocess": (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.masked)()},
    {"name": "L1X$string$2", "symbols": [{"literal":"-"}, {"literal":"X"}, {"literal":"X"}, {"literal":"-"}, {"literal":"X"}, {"literal":"X"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "L1X", "symbols": ["nd4", "L1X$string$2"], "postprocess": (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.masked)()},
    {"name": "L1X$string$3", "symbols": [{"literal":"X"}, {"literal":"X"}, {"literal":"X"}, {"literal":"X"}, {"literal":"-"}, {"literal":"X"}, {"literal":"X"}, {"literal":"-"}, {"literal":"X"}, {"literal":"X"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "L1X", "symbols": ["L1X$string$3"], "postprocess": (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.masked)()},
    {"name": "L1X$string$4", "symbols": [{"literal":"-"}, {"literal":"X"}, {"literal":"X"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "L1X", "symbols": ["nd4", "L1X$string$4"], "postprocess": (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.masked)()},
    {"name": "L1X$string$5", "symbols": [{"literal":"X"}, {"literal":"X"}, {"literal":"X"}, {"literal":"X"}, {"literal":"-"}, {"literal":"X"}, {"literal":"X"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "L1X", "symbols": ["L1X$string$5"], "postprocess": (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.masked)()},
    {"name": "L1X$string$6", "symbols": [{"literal":"X"}, {"literal":"X"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "L1X", "symbols": ["nd2", "L1X$string$6"], "postprocess": (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.masked)()},
    {"name": "L1X", "symbols": ["nd3", {"literal":"X"}], "postprocess": (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.masked)()},
    {"name": "L1X$string$7", "symbols": [{"literal":"X"}, {"literal":"X"}, {"literal":"X"}, {"literal":"X"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "L1X", "symbols": ["L1X$string$7"], "postprocess": (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.masked)()},
    {"name": "L1Y", "symbols": [{"literal":"Y"}, "d5+"], "postprocess": data => (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.year)([(0,_util_js__WEBPACK_IMPORTED_MODULE_0__.num)(data[1])], 1)},
    {"name": "L1Y$string$1", "symbols": [{"literal":"Y"}, {"literal":"-"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "L1Y", "symbols": ["L1Y$string$1", "d5+"], "postprocess": data => (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.year)([-(0,_util_js__WEBPACK_IMPORTED_MODULE_0__.num)(data[1])], 1)},
    {"name": "UA", "symbols": [{"literal":"?"}], "postprocess": () => ({ uncertain: true })},
    {"name": "UA", "symbols": [{"literal":"~"}], "postprocess": () => ({ approximate: true })},
    {"name": "UA", "symbols": [{"literal":"%"}], "postprocess": () => ({ approximate: true, uncertain: true })},
    {"name": "L1S", "symbols": ["year", {"literal":"-"}, "d21_24"], "postprocess": data => (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.season)(data, 1)},
    {"name": "L2", "symbols": ["L2d"], "postprocess": id},
    {"name": "L2", "symbols": ["L2Y"], "postprocess": id},
    {"name": "L2", "symbols": ["L2S"], "postprocess": id},
    {"name": "L2", "symbols": ["L2D"], "postprocess": id},
    {"name": "L2", "symbols": ["L2C"], "postprocess": id},
    {"name": "L2", "symbols": ["L2i"], "postprocess": id},
    {"name": "L2", "symbols": ["set"], "postprocess": id},
    {"name": "L2", "symbols": ["list"], "postprocess": id},
    {"name": "L2d", "symbols": ["ua_date"], "postprocess": id},
    {"name": "L2d", "symbols": ["L2X"], "postprocess": (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.merge)(0, { type: 'Date', level: 2 })},
    {"name": "L2D", "symbols": ["decade"], "postprocess": id},
    {"name": "L2D", "symbols": ["decade", "UA"], "postprocess": (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.merge)(0, 1)},
    {"name": "L2C", "symbols": ["century"], "postprocess": id},
    {"name": "L2C", "symbols": ["century", "UA"], "postprocess": (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.merge)(0, 1, {level: 2})},
    {"name": "ua_date", "symbols": ["ua_year"], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.qualify},
    {"name": "ua_date", "symbols": ["ua_year_month"], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.qualify},
    {"name": "ua_date", "symbols": ["ua_year_month_day"], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.qualify},
    {"name": "ua_year", "symbols": ["UA", "year"], "postprocess": data => [data]},
    {"name": "ua_year_month$macrocall$2", "symbols": ["year"]},
    {"name": "ua_year_month$macrocall$1$ebnf$1", "symbols": ["UA"], "postprocess": id},
    {"name": "ua_year_month$macrocall$1$ebnf$1", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "ua_year_month$macrocall$1$ebnf$2", "symbols": ["UA"], "postprocess": id},
    {"name": "ua_year_month$macrocall$1$ebnf$2", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "ua_year_month$macrocall$1", "symbols": ["ua_year_month$macrocall$1$ebnf$1", "ua_year_month$macrocall$2", "ua_year_month$macrocall$1$ebnf$2"]},
    {"name": "ua_year_month$macrocall$4", "symbols": ["month"]},
    {"name": "ua_year_month$macrocall$3$ebnf$1", "symbols": ["UA"], "postprocess": id},
    {"name": "ua_year_month$macrocall$3$ebnf$1", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "ua_year_month$macrocall$3$ebnf$2", "symbols": ["UA"], "postprocess": id},
    {"name": "ua_year_month$macrocall$3$ebnf$2", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "ua_year_month$macrocall$3", "symbols": ["ua_year_month$macrocall$3$ebnf$1", "ua_year_month$macrocall$4", "ua_year_month$macrocall$3$ebnf$2"]},
    {"name": "ua_year_month", "symbols": ["ua_year_month$macrocall$1", {"literal":"-"}, "ua_year_month$macrocall$3"], "postprocess": (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.pluck)(0, 2)},
    {"name": "ua_year_month_day$macrocall$2", "symbols": ["year"]},
    {"name": "ua_year_month_day$macrocall$1$ebnf$1", "symbols": ["UA"], "postprocess": id},
    {"name": "ua_year_month_day$macrocall$1$ebnf$1", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "ua_year_month_day$macrocall$1$ebnf$2", "symbols": ["UA"], "postprocess": id},
    {"name": "ua_year_month_day$macrocall$1$ebnf$2", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "ua_year_month_day$macrocall$1", "symbols": ["ua_year_month_day$macrocall$1$ebnf$1", "ua_year_month_day$macrocall$2", "ua_year_month_day$macrocall$1$ebnf$2"]},
    {"name": "ua_year_month_day", "symbols": ["ua_year_month_day$macrocall$1", {"literal":"-"}, "ua_month_day"], "postprocess": data => [data[0], ...data[2]]},
    {"name": "ua_month_day$macrocall$2", "symbols": ["m31"]},
    {"name": "ua_month_day$macrocall$1$ebnf$1", "symbols": ["UA"], "postprocess": id},
    {"name": "ua_month_day$macrocall$1$ebnf$1", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "ua_month_day$macrocall$1$ebnf$2", "symbols": ["UA"], "postprocess": id},
    {"name": "ua_month_day$macrocall$1$ebnf$2", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "ua_month_day$macrocall$1", "symbols": ["ua_month_day$macrocall$1$ebnf$1", "ua_month_day$macrocall$2", "ua_month_day$macrocall$1$ebnf$2"]},
    {"name": "ua_month_day$macrocall$4", "symbols": ["day"]},
    {"name": "ua_month_day$macrocall$3$ebnf$1", "symbols": ["UA"], "postprocess": id},
    {"name": "ua_month_day$macrocall$3$ebnf$1", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "ua_month_day$macrocall$3$ebnf$2", "symbols": ["UA"], "postprocess": id},
    {"name": "ua_month_day$macrocall$3$ebnf$2", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "ua_month_day$macrocall$3", "symbols": ["ua_month_day$macrocall$3$ebnf$1", "ua_month_day$macrocall$4", "ua_month_day$macrocall$3$ebnf$2"]},
    {"name": "ua_month_day", "symbols": ["ua_month_day$macrocall$1", {"literal":"-"}, "ua_month_day$macrocall$3"], "postprocess": (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.pluck)(0, 2)},
    {"name": "ua_month_day$macrocall$6", "symbols": ["m30"]},
    {"name": "ua_month_day$macrocall$5$ebnf$1", "symbols": ["UA"], "postprocess": id},
    {"name": "ua_month_day$macrocall$5$ebnf$1", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "ua_month_day$macrocall$5$ebnf$2", "symbols": ["UA"], "postprocess": id},
    {"name": "ua_month_day$macrocall$5$ebnf$2", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "ua_month_day$macrocall$5", "symbols": ["ua_month_day$macrocall$5$ebnf$1", "ua_month_day$macrocall$6", "ua_month_day$macrocall$5$ebnf$2"]},
    {"name": "ua_month_day$macrocall$8", "symbols": ["d01_30"]},
    {"name": "ua_month_day$macrocall$7$ebnf$1", "symbols": ["UA"], "postprocess": id},
    {"name": "ua_month_day$macrocall$7$ebnf$1", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "ua_month_day$macrocall$7$ebnf$2", "symbols": ["UA"], "postprocess": id},
    {"name": "ua_month_day$macrocall$7$ebnf$2", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "ua_month_day$macrocall$7", "symbols": ["ua_month_day$macrocall$7$ebnf$1", "ua_month_day$macrocall$8", "ua_month_day$macrocall$7$ebnf$2"]},
    {"name": "ua_month_day", "symbols": ["ua_month_day$macrocall$5", {"literal":"-"}, "ua_month_day$macrocall$7"], "postprocess": (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.pluck)(0, 2)},
    {"name": "ua_month_day$macrocall$10$string$1", "symbols": [{"literal":"0"}, {"literal":"2"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "ua_month_day$macrocall$10", "symbols": ["ua_month_day$macrocall$10$string$1"]},
    {"name": "ua_month_day$macrocall$9$ebnf$1", "symbols": ["UA"], "postprocess": id},
    {"name": "ua_month_day$macrocall$9$ebnf$1", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "ua_month_day$macrocall$9$ebnf$2", "symbols": ["UA"], "postprocess": id},
    {"name": "ua_month_day$macrocall$9$ebnf$2", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "ua_month_day$macrocall$9", "symbols": ["ua_month_day$macrocall$9$ebnf$1", "ua_month_day$macrocall$10", "ua_month_day$macrocall$9$ebnf$2"]},
    {"name": "ua_month_day$macrocall$12", "symbols": ["d01_29"]},
    {"name": "ua_month_day$macrocall$11$ebnf$1", "symbols": ["UA"], "postprocess": id},
    {"name": "ua_month_day$macrocall$11$ebnf$1", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "ua_month_day$macrocall$11$ebnf$2", "symbols": ["UA"], "postprocess": id},
    {"name": "ua_month_day$macrocall$11$ebnf$2", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "ua_month_day$macrocall$11", "symbols": ["ua_month_day$macrocall$11$ebnf$1", "ua_month_day$macrocall$12", "ua_month_day$macrocall$11$ebnf$2"]},
    {"name": "ua_month_day", "symbols": ["ua_month_day$macrocall$9", {"literal":"-"}, "ua_month_day$macrocall$11"], "postprocess": (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.pluck)(0, 2)},
    {"name": "L2X", "symbols": ["dx4"], "postprocess": (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.masked)()},
    {"name": "L2X", "symbols": ["dx4", {"literal":"-"}, "mx"], "postprocess": (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.masked)()},
    {"name": "L2X", "symbols": ["dx4", {"literal":"-"}, "mdx"], "postprocess": (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.masked)()},
    {"name": "mdx", "symbols": ["m31x", {"literal":"-"}, "d31x"], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.join},
    {"name": "mdx", "symbols": ["m30x", {"literal":"-"}, "d30x"], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.join},
    {"name": "mdx$string$1", "symbols": [{"literal":"0"}, {"literal":"2"}, {"literal":"-"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "mdx", "symbols": ["mdx$string$1", "d29x"], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.join},
    {"name": "L2i", "symbols": ["L2i_date", {"literal":"/"}, "L2i_date"], "postprocess": (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.interval)(2)},
    {"name": "L2i", "symbols": ["date_time", {"literal":"/"}, "L2i_date"], "postprocess": (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.interval)(2)},
    {"name": "L2i", "symbols": ["L2i_date", {"literal":"/"}, "date_time"], "postprocess": (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.interval)(2)},
    {"name": "L2i_date", "symbols": [], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.nothing},
    {"name": "L2i_date", "symbols": ["ua_date"], "postprocess": id},
    {"name": "L2i_date", "symbols": ["L2X"], "postprocess": id},
    {"name": "L2i_date", "symbols": ["INFINITY"], "postprocess": id},
    {"name": "L2Y", "symbols": ["exp_year"], "postprocess": id},
    {"name": "L2Y", "symbols": ["exp_year", "significant_digits"], "postprocess": (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.merge)(0, 1)},
    {"name": "L2Y", "symbols": ["L1Y", "significant_digits"], "postprocess": (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.merge)(0, 1, { level: 2 })},
    {"name": "L2Y", "symbols": ["year", "significant_digits"], "postprocess": data => (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.year)([data[0]], 2, data[1])},
    {"name": "significant_digits", "symbols": [{"literal":"S"}, "positive_digit"], "postprocess": data => ({ significant: (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.num)(data[1]) })},
    {"name": "exp_year", "symbols": [{"literal":"Y"}, "exp"], "postprocess": data => (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.year)([data[1]], 2)},
    {"name": "exp_year$string$1", "symbols": [{"literal":"Y"}, {"literal":"-"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "exp_year", "symbols": ["exp_year$string$1", "exp"], "postprocess": data => (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.year)([-data[1]], 2)},
    {"name": "exp", "symbols": ["digits", {"literal":"E"}, "digits"], "postprocess": data => (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.num)(data[0]) * Math.pow(10, (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.num)(data[2]))},
    {"name": "L2S", "symbols": ["year", {"literal":"-"}, "d25_41"], "postprocess": data => (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.season)(data, 2)},
    {"name": "decade", "symbols": ["positive_decade"], "postprocess": data => (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.decade)(data[0])},
    {"name": "decade$string$1", "symbols": [{"literal":"0"}, {"literal":"0"}, {"literal":"0"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "decade", "symbols": ["decade$string$1"], "postprocess": () => (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.decade)(0)},
    {"name": "decade", "symbols": [{"literal":"-"}, "positive_decade"], "postprocess": data => (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.decade)(-data[1])},
    {"name": "positive_decade", "symbols": ["positive_digit", "digit", "digit"], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.num},
    {"name": "positive_decade", "symbols": [{"literal":"0"}, "positive_digit", "digit"], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.num},
    {"name": "positive_decade$string$1", "symbols": [{"literal":"0"}, {"literal":"0"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "positive_decade", "symbols": ["positive_decade$string$1", "positive_digit"], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.num},
    {"name": "set", "symbols": ["LSB", "OL", "RSB"], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.list},
    {"name": "list", "symbols": ["LLB", "OL", "RLB"], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.list},
    {"name": "LSB", "symbols": [{"literal":"["}], "postprocess": () => ({ type: 'Set' })},
    {"name": "LSB$string$1", "symbols": [{"literal":"["}, {"literal":"."}, {"literal":"."}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "LSB", "symbols": ["LSB$string$1"], "postprocess": () => ({ type: 'Set', earlier: true })},
    {"name": "LLB", "symbols": [{"literal":"{"}], "postprocess": () => ({ type: 'List' })},
    {"name": "LLB$string$1", "symbols": [{"literal":"{"}, {"literal":"."}, {"literal":"."}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "LLB", "symbols": ["LLB$string$1"], "postprocess": () => ({ type: 'List', earlier: true })},
    {"name": "RSB", "symbols": [{"literal":"]"}], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.nothing},
    {"name": "RSB$string$1", "symbols": [{"literal":"."}, {"literal":"."}, {"literal":"]"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "RSB", "symbols": ["RSB$string$1"], "postprocess": () => ({ later: true })},
    {"name": "RLB", "symbols": [{"literal":"}"}], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.nothing},
    {"name": "RLB$string$1", "symbols": [{"literal":"."}, {"literal":"."}, {"literal":"}"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "RLB", "symbols": ["RLB$string$1"], "postprocess": () => ({ later: true })},
    {"name": "OL", "symbols": ["LI"], "postprocess": data => [data[0]]},
    {"name": "OL", "symbols": ["OL", "_", {"literal":","}, "_", "LI"], "postprocess": data => [...data[0], data[4]]},
    {"name": "LI", "symbols": ["date"], "postprocess": id},
    {"name": "LI", "symbols": ["ua_date"], "postprocess": id},
    {"name": "LI", "symbols": ["L2X"], "postprocess": id},
    {"name": "LI", "symbols": ["consecutives"], "postprocess": id},
    {"name": "consecutives$string$1", "symbols": [{"literal":"."}, {"literal":"."}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "consecutives", "symbols": ["year_month_day", "consecutives$string$1", "year_month_day"], "postprocess": d => [(0,_util_js__WEBPACK_IMPORTED_MODULE_0__.date)(d[0]), (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.date)(d[2])]},
    {"name": "consecutives$string$2", "symbols": [{"literal":"."}, {"literal":"."}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "consecutives", "symbols": ["year_month", "consecutives$string$2", "year_month"], "postprocess": d => [(0,_util_js__WEBPACK_IMPORTED_MODULE_0__.date)(d[0]), (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.date)(d[2])]},
    {"name": "consecutives$string$3", "symbols": [{"literal":"."}, {"literal":"."}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "consecutives", "symbols": ["year", "consecutives$string$3", "year"], "postprocess": d => [(0,_util_js__WEBPACK_IMPORTED_MODULE_0__.date)([d[0]]), (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.date)([d[2]])]},
    {"name": "L3", "symbols": ["L3i"], "postprocess": id},
    {"name": "L3i", "symbols": ["L3S", {"literal":"/"}, "L3S"], "postprocess": (0,_util_js__WEBPACK_IMPORTED_MODULE_0__.interval)(3)},
    {"name": "L3S", "symbols": ["L1S"], "postprocess": id},
    {"name": "L3S", "symbols": ["L2S"], "postprocess": id},
    {"name": "digit", "symbols": ["positive_digit"], "postprocess": id},
    {"name": "digit", "symbols": [{"literal":"0"}], "postprocess": id},
    {"name": "digits", "symbols": ["digit"], "postprocess": id},
    {"name": "digits", "symbols": ["digits", "digit"], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.join},
    {"name": "nd4", "symbols": ["d4"]},
    {"name": "nd4", "symbols": [{"literal":"-"}, "d4"], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.join},
    {"name": "nd3", "symbols": ["d3"]},
    {"name": "nd3", "symbols": [{"literal":"-"}, "d3"], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.join},
    {"name": "nd2", "symbols": ["d2"]},
    {"name": "nd2", "symbols": [{"literal":"-"}, "d2"], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.join},
    {"name": "d4", "symbols": ["d2", "d2"], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.join},
    {"name": "d3", "symbols": ["d2", "digit"], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.join},
    {"name": "d2", "symbols": ["digit", "digit"], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.join},
    {"name": "d5+", "symbols": ["positive_digit", "d3", "digits"], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.num},
    {"name": "d1x", "symbols": [/[1-9X]/], "postprocess": id},
    {"name": "dx", "symbols": ["d1x"], "postprocess": id},
    {"name": "dx", "symbols": [{"literal":"0"}], "postprocess": id},
    {"name": "dx2", "symbols": ["dx", "dx"], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.join},
    {"name": "dx4", "symbols": ["dx2", "dx2"], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.join},
    {"name": "dx4", "symbols": [{"literal":"-"}, "dx2", "dx2"], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.join},
    {"name": "md", "symbols": ["m31"], "postprocess": id},
    {"name": "md", "symbols": ["m30"], "postprocess": id},
    {"name": "md$string$1", "symbols": [{"literal":"0"}, {"literal":"2"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "md", "symbols": ["md$string$1"], "postprocess": id},
    {"name": "mx", "symbols": [{"literal":"0"}, "d1x"], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.join},
    {"name": "mx", "symbols": [/[1X]/, /[012X]/], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.join},
    {"name": "m31x", "symbols": [/[0X]/, /[13578X]/], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.join},
    {"name": "m31x", "symbols": [/[1X]/, /[02]/], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.join},
    {"name": "m31x$string$1", "symbols": [{"literal":"1"}, {"literal":"X"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "m31x", "symbols": ["m31x$string$1"], "postprocess": id},
    {"name": "m30x", "symbols": [/[0X]/, /[469]/], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.join},
    {"name": "m30x$string$1", "symbols": [{"literal":"1"}, {"literal":"1"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "m30x", "symbols": ["m30x$string$1"], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.join},
    {"name": "d29x", "symbols": [{"literal":"0"}, "d1x"], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.join},
    {"name": "d29x", "symbols": [/[1-2X]/, "dx"], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.join},
    {"name": "d30x", "symbols": ["d29x"], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.join},
    {"name": "d30x$string$1", "symbols": [{"literal":"3"}, {"literal":"0"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "d30x", "symbols": ["d30x$string$1"], "postprocess": id},
    {"name": "d31x", "symbols": ["d30x"], "postprocess": id},
    {"name": "d31x", "symbols": [{"literal":"3"}, /[1X]/], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.join},
    {"name": "positive_digit", "symbols": [/[1-9]/], "postprocess": id},
    {"name": "m31$subexpression$1$string$1", "symbols": [{"literal":"0"}, {"literal":"1"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "m31$subexpression$1", "symbols": ["m31$subexpression$1$string$1"]},
    {"name": "m31$subexpression$1$string$2", "symbols": [{"literal":"0"}, {"literal":"3"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "m31$subexpression$1", "symbols": ["m31$subexpression$1$string$2"]},
    {"name": "m31$subexpression$1$string$3", "symbols": [{"literal":"0"}, {"literal":"5"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "m31$subexpression$1", "symbols": ["m31$subexpression$1$string$3"]},
    {"name": "m31$subexpression$1$string$4", "symbols": [{"literal":"0"}, {"literal":"7"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "m31$subexpression$1", "symbols": ["m31$subexpression$1$string$4"]},
    {"name": "m31$subexpression$1$string$5", "symbols": [{"literal":"0"}, {"literal":"8"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "m31$subexpression$1", "symbols": ["m31$subexpression$1$string$5"]},
    {"name": "m31$subexpression$1$string$6", "symbols": [{"literal":"1"}, {"literal":"0"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "m31$subexpression$1", "symbols": ["m31$subexpression$1$string$6"]},
    {"name": "m31$subexpression$1$string$7", "symbols": [{"literal":"1"}, {"literal":"2"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "m31$subexpression$1", "symbols": ["m31$subexpression$1$string$7"]},
    {"name": "m31", "symbols": ["m31$subexpression$1"], "postprocess": id},
    {"name": "m30$subexpression$1$string$1", "symbols": [{"literal":"0"}, {"literal":"4"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "m30$subexpression$1", "symbols": ["m30$subexpression$1$string$1"]},
    {"name": "m30$subexpression$1$string$2", "symbols": [{"literal":"0"}, {"literal":"6"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "m30$subexpression$1", "symbols": ["m30$subexpression$1$string$2"]},
    {"name": "m30$subexpression$1$string$3", "symbols": [{"literal":"0"}, {"literal":"9"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "m30$subexpression$1", "symbols": ["m30$subexpression$1$string$3"]},
    {"name": "m30$subexpression$1$string$4", "symbols": [{"literal":"1"}, {"literal":"1"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "m30$subexpression$1", "symbols": ["m30$subexpression$1$string$4"]},
    {"name": "m30", "symbols": ["m30$subexpression$1"], "postprocess": id},
    {"name": "d01_11", "symbols": [{"literal":"0"}, "positive_digit"], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.join},
    {"name": "d01_11", "symbols": [{"literal":"1"}, /[0-1]/], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.join},
    {"name": "d01_12", "symbols": ["d01_11"], "postprocess": id},
    {"name": "d01_12$string$1", "symbols": [{"literal":"1"}, {"literal":"2"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "d01_12", "symbols": ["d01_12$string$1"], "postprocess": id},
    {"name": "d01_13", "symbols": ["d01_12"], "postprocess": id},
    {"name": "d01_13$string$1", "symbols": [{"literal":"1"}, {"literal":"3"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "d01_13", "symbols": ["d01_13$string$1"], "postprocess": id},
    {"name": "d00_14$string$1", "symbols": [{"literal":"0"}, {"literal":"0"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "d00_14", "symbols": ["d00_14$string$1"], "postprocess": id},
    {"name": "d00_14", "symbols": ["d01_13"], "postprocess": id},
    {"name": "d00_14$string$2", "symbols": [{"literal":"1"}, {"literal":"4"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "d00_14", "symbols": ["d00_14$string$2"], "postprocess": id},
    {"name": "d00_23$string$1", "symbols": [{"literal":"0"}, {"literal":"0"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "d00_23", "symbols": ["d00_23$string$1"], "postprocess": id},
    {"name": "d00_23", "symbols": ["d01_23"], "postprocess": id},
    {"name": "d01_23", "symbols": [{"literal":"0"}, "positive_digit"], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.join},
    {"name": "d01_23", "symbols": [{"literal":"1"}, "digit"], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.join},
    {"name": "d01_23", "symbols": [{"literal":"2"}, /[0-3]/], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.join},
    {"name": "d01_29", "symbols": [{"literal":"0"}, "positive_digit"], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.join},
    {"name": "d01_29", "symbols": [/[1-2]/, "digit"], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.join},
    {"name": "d01_30", "symbols": ["d01_29"], "postprocess": id},
    {"name": "d01_30$string$1", "symbols": [{"literal":"3"}, {"literal":"0"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "d01_30", "symbols": ["d01_30$string$1"], "postprocess": id},
    {"name": "d01_31", "symbols": ["d01_30"], "postprocess": id},
    {"name": "d01_31$string$1", "symbols": [{"literal":"3"}, {"literal":"1"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "d01_31", "symbols": ["d01_31$string$1"], "postprocess": id},
    {"name": "d00_59$string$1", "symbols": [{"literal":"0"}, {"literal":"0"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "d00_59", "symbols": ["d00_59$string$1"], "postprocess": id},
    {"name": "d00_59", "symbols": ["d01_59"], "postprocess": id},
    {"name": "d01_59", "symbols": ["d01_29"], "postprocess": id},
    {"name": "d01_59", "symbols": [/[345]/, "digit"], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.join},
    {"name": "d21_24", "symbols": [{"literal":"2"}, /[1-4]/], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.join},
    {"name": "d25_41", "symbols": [{"literal":"2"}, /[5-9]/], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.join},
    {"name": "d25_41", "symbols": [{"literal":"3"}, "digit"], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.join},
    {"name": "d25_41", "symbols": [{"literal":"4"}, /[01]/], "postprocess": _util_js__WEBPACK_IMPORTED_MODULE_0__.join},
    {"name": "_$ebnf$1", "symbols": []},
    {"name": "_$ebnf$1", "symbols": ["_$ebnf$1", {"literal":" "}], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "_", "symbols": ["_$ebnf$1"]}
];
let ParserStart = "edtf";
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = ({ Lexer, ParserRules, ParserStart });


/***/ }),

/***/ "./node_modules/edtf/src/interface.js":
/*!********************************************!*\
  !*** ./node_modules/edtf/src/interface.js ***!
  \********************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ExtDateTime: () => (/* binding */ ExtDateTime)
/* harmony export */ });
/* harmony import */ var _parser_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./parser.js */ "./node_modules/edtf/src/parser.js");


class ExtDateTime {

  static get type() {
    return this.name
  }

  static parse(input) {
    return (0,_parser_js__WEBPACK_IMPORTED_MODULE_0__.parse)(input, { types: [this.type] })
  }

  static from(input) {
    return (input instanceof this) ? input : new this(input)
  }

  static UTC(...args) {
    let time = Date.UTC(...args)

    // ECMA Date constructor converts 0-99 to 1900-1999!
    if (args[0] >= 0 && args[0] < 100)
      time = adj(new Date(time))

    return time
  }

  get type() {
    return this.constructor.type
  }

  get edtf() {
    return this.toEDTF()
  }

  get isEDTF() {
    return true
  }

  toJSON() {
    return this.toEDTF()
  }

  toString() {
    return this.toEDTF()
  }

  toLocaleString(...args) {
    return this.localize(...args)
  }

  inspect() {
    return this.toEDTF()
  }

  valueOf() {
    return this.min
  }

  [Symbol.toPrimitive](hint) {
    return (hint === 'number') ? this.valueOf() : this.toEDTF()
  }


  covers(other) {
    return (this.min <= other.min) && (this.max >= other.max)
  }

  compare(other) {
    if (other.min == null || other.max == null) return null

    let [a, x, b, y] = [this.min, this.max, other.min, other.max]

    if (a !== b)
      return a < b ? -1 : 1

    if (x !== y)
      return x < y ? -1 : 1

    return 0
  }

  includes(other) {
    let covered = this.covers(other)
    if (!covered || !this[Symbol.iterator]) return covered

    for (let cur of this) {
      if (cur.edtf === other.edtf) return true
    }

    return false
  }

  *until(then) {
    yield this
    if (this.compare(then)) yield* this.between(then)
  }

  *through(then) {
    yield* this.until(then)
    if (this.compare(then)) yield then
  }

  *between(then) {
    then = this.constructor.from(then)

    let cur = this
    let dir = this.compare(then)

    if (!dir) return

    for (;;) {
      cur = cur.next(-dir)
      if (cur.compare(then) !== dir) break
      yield cur
    }
  }
}

function adj(date, by = 1900) {
  date.setUTCFullYear(date.getUTCFullYear() - by)
  return date.getTime()
}


/***/ }),

/***/ "./node_modules/edtf/src/interval.js":
/*!*******************************************!*\
  !*** ./node_modules/edtf/src/interval.js ***!
  \*******************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Interval: () => (/* binding */ Interval)
/* harmony export */ });
/* harmony import */ var _assert_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./assert.js */ "./node_modules/edtf/src/assert.js");
/* harmony import */ var _date_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./date.js */ "./node_modules/edtf/src/date.js");
/* harmony import */ var _interface_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./interface.js */ "./node_modules/edtf/src/interface.js");
/* harmony import */ var _season_js__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./season.js */ "./node_modules/edtf/src/season.js");





const V = new WeakMap()


class Interval extends _interface_js__WEBPACK_IMPORTED_MODULE_2__.ExtDateTime {
  constructor(...args) {
    super()

    V.set(this, [null, null])

    switch (args.length) {
    case 2:
      this.lower = args[0]
      this.upper = args[1]
      break

    case 1:
      switch (typeof args[0]) {
      case 'string':
        args[0] = Interval.parse(args[0])

      // eslint-disable-next-line no-fallthrough
      case 'object':
        if (Array.isArray(args[0]))
          args[0] = { values: args[0] }

        {
          let [obj] = args

          ;(0,_assert_js__WEBPACK_IMPORTED_MODULE_0__["default"])(obj !== null)
          if (obj.type) _assert_js__WEBPACK_IMPORTED_MODULE_0__["default"].equal('Interval', obj.type)

          ;(0,_assert_js__WEBPACK_IMPORTED_MODULE_0__["default"])(obj.values)
          ;(0,_assert_js__WEBPACK_IMPORTED_MODULE_0__["default"])(obj.values.length < 3)

          this.lower = obj.values[0]
          this.upper = obj.values[1]

          this.earlier = obj.earlier
          this.later = obj.later
        }
        break

      default:
        this.lower = args[0]
      }
      break

    case 0:
      break

    default:
      throw new RangeError(`invalid interval value: ${args}`)
    }
  }

  get lower() {
    return this.values[0]
  }

  set lower(value) {
    if (value == null)
      return this.values[0] = null

    if (value === Infinity || value === -Infinity)
      return this.values[0] = Infinity

    value = getDateOrSeasonFrom(value)

    if (value >= this.upper && this.upper != null)
      throw new RangeError(`invalid lower bound: ${value}`)

    this.values[0] = value
  }

  get upper() {
    return this.values[1]
  }

  set upper(value) {
    if (value == null)
      return this.values[1] = null

    if (value === Infinity)
      return this.values[1] = Infinity

    value = getDateOrSeasonFrom(value)

    if (this.lower !== null && this.lower !== Infinity && value <= this.lower)
      throw new RangeError(`invalid upper bound: ${value}`)

    this.values[1] =  value
  }

  get finite() {
    return (this.lower != null && this.lower !== Infinity) &&
      (this.upper != null && this.upper !== Infinity)
  }

  *[Symbol.iterator]() {
    if (!this.finite) throw Error('cannot iterate infinite interval')
    yield* this.lower.through(this.upper)
  }

  get values() {
    return V.get(this)
  }

  get min() {
    let v = this.lower
    return !v ? null : (v === Infinity) ? -Infinity : v.min
  }

  get max() {
    let v = this.upper
    return !v ? null : (v === Infinity) ? Infinity : v.max
  }

  toEDTF() {
    return this.values
      .map(v => {
        if (v === Infinity) return '..'
        if (!v) return ''
        return v.edtf
      })
      .join('/')
  }
}

function getDateOrSeasonFrom(value) {
  try {
    return _date_js__WEBPACK_IMPORTED_MODULE_1__.Date.from(value)
  } catch (de) {
    return _season_js__WEBPACK_IMPORTED_MODULE_3__.Season.from(value)
  }
}


/***/ }),

/***/ "./node_modules/edtf/src/list.js":
/*!***************************************!*\
  !*** ./node_modules/edtf/src/list.js ***!
  \***************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   List: () => (/* binding */ List)
/* harmony export */ });
/* harmony import */ var _assert_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./assert.js */ "./node_modules/edtf/src/assert.js");
/* harmony import */ var _date_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./date.js */ "./node_modules/edtf/src/date.js");
/* harmony import */ var _interface_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./interface.js */ "./node_modules/edtf/src/interface.js");




const { isArray } = Array
const V = new WeakMap()


class List extends _interface_js__WEBPACK_IMPORTED_MODULE_2__.ExtDateTime {
  constructor(...args) {
    super()

    V.set(this, [])

    if (args.length > 1) args = [args]

    if (args.length) {
      switch (typeof args[0]) {
      case 'string':
        args[0] = new.target.parse(args[0])

      // eslint-disable-next-line no-fallthrough
      case 'object':
        if (isArray(args[0]))
          args[0] = { values: args[0] }

        {
          let [obj] = args

          ;(0,_assert_js__WEBPACK_IMPORTED_MODULE_0__["default"])(obj !== null)
          if (obj.type) _assert_js__WEBPACK_IMPORTED_MODULE_0__["default"].equal(this.type, obj.type)

          ;(0,_assert_js__WEBPACK_IMPORTED_MODULE_0__["default"])(obj.values)
          this.concat(...obj.values)

          this.earlier = !!obj.earlier
          this.later = !!obj.later
        }
        break

      default:
        throw new RangeError(`invalid ${this.type} value: ${args}`)
      }
    }
  }

  get values() {
    return V.get(this)
  }

  get length() {
    return this.values.length
  }

  get empty() {
    return this.length === 0
  }

  get first() {
    let value = this.values[0]
    return isArray(value) ? value[0] : value
  }

  get last() {
    let value = this.values[this.length - 1]
    return isArray(value) ? value[0] : value
  }

  clear() {
    return (this.values.length = 0), this
  }

  concat(...args) {
    for (let value of args) this.push(value)
    return this
  }

  push(value) {
    if (isArray(value)) {
      _assert_js__WEBPACK_IMPORTED_MODULE_0__["default"].equal(2, value.length)
      return this.values.push(value.map(v => _date_js__WEBPACK_IMPORTED_MODULE_1__.Date.from(v)))
    }

    return this.values.push(_date_js__WEBPACK_IMPORTED_MODULE_1__.Date.from(value))
  }

  *[Symbol.iterator]() {
    for (let value of this.values) {
      if (isArray(value))
        yield* value[0].through(value[1])
      else
        yield value
    }
  }

  get min() {
    return this.earlier ? -Infinity : (this.empty ? 0 : this.first.min)
  }

  get max() {
    return this.later ? Infinity : (this.empty ? 0 : this.last.max)
  }

  content() {
    return this
      .values
      .map(v => isArray(v) ? v.map(d => d.edtf).join('..') : v.edtf)
      .join(',')
  }

  toEDTF() {
    return this.wrap(this.empty ?
      '' :
      `${this.earlier ? '..' : ''}${this.content()}${this.later ? '..' : ''}`
    )
  }

  wrap(content) {
    return `{${content}}`
  }
}


/***/ }),

/***/ "./node_modules/edtf/src/mixin.js":
/*!****************************************!*\
  !*** ./node_modules/edtf/src/mixin.js ***!
  \****************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   mixin: () => (/* binding */ mixin)
/* harmony export */ });
const keys = Reflect.ownKeys.bind(Reflect)
const descriptor = Object.getOwnPropertyDescriptor.bind(Object)
const define = Object.defineProperty.bind(Object)
const has = Object.prototype.hasOwnProperty

function mixin(target, ...mixins) {
  for (let source of mixins) {
    inherit(target, source)
    inherit(target.prototype, source.prototype)
  }

  return target
}

function inherit(target, source) {
  for (let key of keys(source)) {
    if (!has.call(target, key)) {
      define(target, key, descriptor(source, key))
    }
  }
}


/***/ }),

/***/ "./node_modules/edtf/src/parser.js":
/*!*****************************************!*\
  !*** ./node_modules/edtf/src/parser.js ***!
  \*****************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   defaults: () => (/* binding */ defaults),
/* harmony export */   parse: () => (/* binding */ parse),
/* harmony export */   parser: () => (/* binding */ parser)
/* harmony export */ });
/* harmony import */ var nearley__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! nearley */ "./node_modules/nearley/lib/nearley.js");
/* harmony import */ var _grammar_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./grammar.js */ "./node_modules/edtf/src/grammar.js");



const defaults = {
  level: 2,
  types: [],
  seasonIntervals: false
}

function byLevel(a, b) {
  return a.level < b.level ? -1 : a.level > b.level ? 1 : 0
}

function limit(results, constraints = {}) {
  if (!results.length) return results

  let {
    level,
    types,
    seasonIntervals
  } = { ...defaults, ...constraints }


  return results.filter(res => {
    if (seasonIntervals && isSeasonInterval(res))
      return true

    if (res.level > level)
      return false
    if (types.length && !types.includes(res.type))
      return false

    return true
  })
}

function isSeasonInterval({ type, values }) {
  return type === 'Interval' && values[0].type === 'Season'
}

function best(results) {
  if (results.length < 2) return results[0]

  // If there are multiple results, pick the first
  // one on the lowest level!
  return results.sort(byLevel)[0]
}

function parse(input, constraints = {}) {
  try {
    let nep = parser()
    let res = best(limit(nep.feed(input).results, constraints))

    if (!res) throw new Error('edtf: No possible parsings (@EOS)')

    return res

  } catch (error) {
    error.message += ` for "${input}"`
    throw error
  }
}

function parser() {
  return new nearley__WEBPACK_IMPORTED_MODULE_0__.Parser(_grammar_js__WEBPACK_IMPORTED_MODULE_1__["default"].ParserRules, _grammar_js__WEBPACK_IMPORTED_MODULE_1__["default"].ParserStart)
}


/***/ }),

/***/ "./node_modules/edtf/src/season.js":
/*!*****************************************!*\
  !*** ./node_modules/edtf/src/season.js ***!
  \*****************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Season: () => (/* binding */ Season)
/* harmony export */ });
/* harmony import */ var _assert_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./assert.js */ "./node_modules/edtf/src/assert.js");
/* harmony import */ var _interface_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./interface.js */ "./node_modules/edtf/src/interface.js");
/* harmony import */ var _date_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./date.js */ "./node_modules/edtf/src/date.js");




const V = new WeakMap()

class Season extends _interface_js__WEBPACK_IMPORTED_MODULE_1__.ExtDateTime {
  constructor(input) {
    super()

    V.set(this, [])

    switch (typeof input) {
    case 'number':
      this.year = input
      this.season = arguments[1] || 21
      break

    case 'string':
      input = Season.parse(input)

    // eslint-disable-next-line no-fallthrough
    case 'object':
      if (Array.isArray(input))
        input = { values: input }

      {
        ;(0,_assert_js__WEBPACK_IMPORTED_MODULE_0__["default"])(input !== null)
        if (input.type) _assert_js__WEBPACK_IMPORTED_MODULE_0__["default"].equal('Season', input.type)

        ;(0,_assert_js__WEBPACK_IMPORTED_MODULE_0__["default"])(input.values)
        _assert_js__WEBPACK_IMPORTED_MODULE_0__["default"].equal(2, input.values.length)

        this.year = input.values[0]
        this.season = input.values[1]
      }
      break

    case 'undefined':
      this.year = new Date().getUTCFullYear()
      this.season = 21
      break

    default:
      throw new RangeError('Invalid season value')
    }
  }

  get year() {
    return this.values[0]
  }

  set year(year) {
    this.values[0] = Number(year)
  }

  get season() {
    return this.values[1]
  }

  set season(season) {
    this.values[1] = validate(Number(season))
  }

  get values() {
    return V.get(this)
  }

  next(k = 1) {
    let { season, year } = this

    switch (true) {
    case (season >= 21 && season <= 36):
      [year, season] = inc(year, season, k, season - (season - 21) % 4, 4)
      break
    case (season >= 37 && season <= 39):
      [year, season] = inc(year, season, k, 37, 3)
      break
    case (season >= 40 && season <= 41):
      [year, season] = inc(year, season, k, 40, 2)
      break
    default:
      throw new RangeError(`Cannot compute next/prev for season ${season}`)
    }

    return new Season(year, season)
  }

  prev(k = 1) {
    return this.next(-k)
  }

  get min() { // eslint-disable-line complexity
    switch (this.season) {
    case 21:
    case 25:
    case 32:
    case 33:
    case 40:
    case 37:
      return _interface_js__WEBPACK_IMPORTED_MODULE_1__.ExtDateTime.UTC(this.year, 0)

    case 22:
    case 26:
    case 31:
    case 34:
      return _interface_js__WEBPACK_IMPORTED_MODULE_1__.ExtDateTime.UTC(this.year, 3)

    case 23:
    case 27:
    case 30:
    case 35:
    case 41:
      return _interface_js__WEBPACK_IMPORTED_MODULE_1__.ExtDateTime.UTC(this.year, 6)

    case 24:
    case 28:
    case 29:
    case 36:
      return _interface_js__WEBPACK_IMPORTED_MODULE_1__.ExtDateTime.UTC(this.year, 9)

    case 38:
      return _interface_js__WEBPACK_IMPORTED_MODULE_1__.ExtDateTime.UTC(this.year, 4)

    case 39:
      return _interface_js__WEBPACK_IMPORTED_MODULE_1__.ExtDateTime.UTC(this.year, 8)

    default:
      return _interface_js__WEBPACK_IMPORTED_MODULE_1__.ExtDateTime.UTC(this.year, 0)
    }
  }

  get max() { // eslint-disable-line complexity
    switch (this.season) {
    case 21:
    case 25:
    case 32:
    case 33:
      return _interface_js__WEBPACK_IMPORTED_MODULE_1__.ExtDateTime.UTC(this.year, 3) - 1

    case 22:
    case 26:
    case 31:
    case 34:
    case 40:
      return _interface_js__WEBPACK_IMPORTED_MODULE_1__.ExtDateTime.UTC(this.year, 6) - 1

    case 23:
    case 27:
    case 30:
    case 35:
      return _interface_js__WEBPACK_IMPORTED_MODULE_1__.ExtDateTime.UTC(this.year, 9) - 1

    case 24:
    case 28:
    case 29:
    case 36:
    case 41:
    case 39:
      return _interface_js__WEBPACK_IMPORTED_MODULE_1__.ExtDateTime.UTC(this.year + 1, 0) - 1

    case 37:
      return _interface_js__WEBPACK_IMPORTED_MODULE_1__.ExtDateTime.UTC(this.year, 5) - 1

    case 38:
      return _interface_js__WEBPACK_IMPORTED_MODULE_1__.ExtDateTime.UTC(this.year, 9) - 1

    default:
      return _interface_js__WEBPACK_IMPORTED_MODULE_1__.ExtDateTime.UTC(this.year + 1, 0) - 1
    }
  }

  toEDTF() {
    return `${this.year < 0 ? '-' : ''}${(0,_date_js__WEBPACK_IMPORTED_MODULE_2__.pad)(this.year)}-${this.season}`
  }
}

function validate(season) {
  if (isNaN(season) || season < 21 || season === Infinity)
    throw new RangeError(`invalid division of year: ${season}`)
  return season
}

function inc(year, season, by, base, size) {
  const m = (season + by) - base

  return [
    year + Math.floor(m / size),
    validate(base + (m % size + size) % size)
  ]
}


/***/ }),

/***/ "./node_modules/edtf/src/set.js":
/*!**************************************!*\
  !*** ./node_modules/edtf/src/set.js ***!
  \**************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Set: () => (/* binding */ Set)
/* harmony export */ });
/* harmony import */ var _list_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./list.js */ "./node_modules/edtf/src/list.js");
/* harmony import */ var _parser_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./parser.js */ "./node_modules/edtf/src/parser.js");



class Set extends _list_js__WEBPACK_IMPORTED_MODULE_0__.List {
  static parse(input) {
    return (0,_parser_js__WEBPACK_IMPORTED_MODULE_1__.parse)(input, { types: ['Set'] })
  }

  get type() {
    return 'Set'
  }

  wrap(content) {
    return `[${content}]`
  }
}


/***/ }),

/***/ "./node_modules/edtf/src/types.js":
/*!****************************************!*\
  !*** ./node_modules/edtf/src/types.js ***!
  \****************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Century: () => (/* reexport safe */ _century_js__WEBPACK_IMPORTED_MODULE_3__.Century),
/* harmony export */   Date: () => (/* reexport safe */ _date_js__WEBPACK_IMPORTED_MODULE_0__.Date),
/* harmony export */   Decade: () => (/* reexport safe */ _decade_js__WEBPACK_IMPORTED_MODULE_2__.Decade),
/* harmony export */   Interval: () => (/* reexport safe */ _interval_js__WEBPACK_IMPORTED_MODULE_5__.Interval),
/* harmony export */   List: () => (/* reexport safe */ _list_js__WEBPACK_IMPORTED_MODULE_6__.List),
/* harmony export */   Season: () => (/* reexport safe */ _season_js__WEBPACK_IMPORTED_MODULE_4__.Season),
/* harmony export */   Set: () => (/* reexport safe */ _set_js__WEBPACK_IMPORTED_MODULE_7__.Set),
/* harmony export */   Year: () => (/* reexport safe */ _year_js__WEBPACK_IMPORTED_MODULE_1__.Year)
/* harmony export */ });
/* harmony import */ var _date_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./date.js */ "./node_modules/edtf/src/date.js");
/* harmony import */ var _year_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./year.js */ "./node_modules/edtf/src/year.js");
/* harmony import */ var _decade_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./decade.js */ "./node_modules/edtf/src/decade.js");
/* harmony import */ var _century_js__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./century.js */ "./node_modules/edtf/src/century.js");
/* harmony import */ var _season_js__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./season.js */ "./node_modules/edtf/src/season.js");
/* harmony import */ var _interval_js__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ./interval.js */ "./node_modules/edtf/src/interval.js");
/* harmony import */ var _list_js__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ./list.js */ "./node_modules/edtf/src/list.js");
/* harmony import */ var _set_js__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ./set.js */ "./node_modules/edtf/src/set.js");










/***/ }),

/***/ "./node_modules/edtf/src/util.js":
/*!***************************************!*\
  !*** ./node_modules/edtf/src/util.js ***!
  \***************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   century: () => (/* binding */ century),
/* harmony export */   concat: () => (/* binding */ concat),
/* harmony export */   date: () => (/* binding */ date),
/* harmony export */   datetime: () => (/* binding */ datetime),
/* harmony export */   decade: () => (/* binding */ decade),
/* harmony export */   interval: () => (/* binding */ interval),
/* harmony export */   join: () => (/* binding */ join),
/* harmony export */   list: () => (/* binding */ list),
/* harmony export */   masked: () => (/* binding */ masked),
/* harmony export */   merge: () => (/* binding */ merge),
/* harmony export */   nothing: () => (/* binding */ nothing),
/* harmony export */   num: () => (/* binding */ num),
/* harmony export */   pick: () => (/* binding */ pick),
/* harmony export */   pluck: () => (/* binding */ pluck),
/* harmony export */   qualify: () => (/* binding */ qualify),
/* harmony export */   season: () => (/* binding */ season),
/* harmony export */   year: () => (/* binding */ year),
/* harmony export */   zero: () => (/* binding */ zero)
/* harmony export */ });
/* harmony import */ var _bitmask_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./bitmask.js */ "./node_modules/edtf/src/bitmask.js");

const { assign } = Object


function num(data) {
  return Number(Array.isArray(data) ? data.join('') : data)
}

function join(data) {
  return data.join('')
}

function zero() { return 0 }

function nothing() { return null }

function pick(...args) {
  return args.length === 1 ?
    data => data[args[0]] :
    data => concat(data, args)
}

function pluck(...args) {
  return data => args.map(i => data[i])
}

function concat(data, idx = data.keys()) {
  return Array.from(idx)
    .reduce((memo, i) => data[i] !== null ? memo.concat(data[i]) : memo, [])
}

function merge(...args) {
  if (typeof args[args.length - 1] === 'object')
    var extra = args.pop()

  return data => assign(args.reduce((a, i) => assign(a, data[i]), {}), extra)
}

function interval(level) {
  return data => ({
    values: [data[0], data[2]],
    type: 'Interval',
    level
  })
}

function masked(type = 'unspecified', symbol = 'X') {
  return (data, _, reject) => {
    data = data.join('')

    let negative = data.startsWith('-')
    let mask = data.replace(/-/g, '')

    if (mask.indexOf(symbol) === -1) return reject

    let values = _bitmask_js__WEBPACK_IMPORTED_MODULE_0__.Bitmask.values(mask, 0)

    if (negative) values[0] = -values[0]

    return {
      values, [type]: _bitmask_js__WEBPACK_IMPORTED_MODULE_0__.Bitmask.compute(mask)
    }
  }
}

function date(values, level = 0, extra = null) {
  return assign({
    type: 'Date',
    level,
    values: _bitmask_js__WEBPACK_IMPORTED_MODULE_0__.Bitmask.normalize(values.map(Number))
  }, extra)
}

function year(values, level = 1, extra = null) {
  return assign({
    type: 'Year',
    level,
    values: values.map(Number)
  }, extra)
}

function century(value, level = 0) {
  return {
    type: 'Century',
    level,
    values: [value]
  }
}

function decade(value, level = 2) {
  return {
    type: 'Decade',
    level,
    values: [value]
  }
}

function datetime(data) {
  let offset = data[3]
  if (offset == null) offset = new Date().getTimezoneOffset()

  return {
    values: _bitmask_js__WEBPACK_IMPORTED_MODULE_0__.Bitmask.normalize(data[0].map(Number)).concat(data[2]),
    offset,
    type: 'Date',
    level: 0
  }
}

function season(data, level = 1) {
  return {
    type: 'Season',
    level,
    values: [Number(data[0]), Number(data[2])]
  }
}

function list(data) {
  return assign({ values: data[1], level: 2 }, data[0], data[2])
}

function qualify([parts], _, reject) {
  let q = {
    uncertain: new _bitmask_js__WEBPACK_IMPORTED_MODULE_0__.Bitmask(), approximate: new _bitmask_js__WEBPACK_IMPORTED_MODULE_0__.Bitmask()
  }

  let values = parts
    .map(([lhs, part, rhs], idx) => {
      for (let ua in lhs) q[ua].qualify(idx * 2)
      for (let ua in rhs) q[ua].qualify(1 + idx * 2)
      return part
    })

  return (!q.uncertain.value && !q.approximate.value) ?
    reject : {
      ...date(values, 2),
      uncertain: q.uncertain.value,
      approximate: q.approximate.value
    }
}


/***/ }),

/***/ "./node_modules/edtf/src/year.js":
/*!***************************************!*\
  !*** ./node_modules/edtf/src/year.js ***!
  \***************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Year: () => (/* binding */ Year)
/* harmony export */ });
/* harmony import */ var _assert_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./assert.js */ "./node_modules/edtf/src/assert.js");
/* harmony import */ var _interface_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./interface.js */ "./node_modules/edtf/src/interface.js");
/* harmony import */ var _date_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./date.js */ "./node_modules/edtf/src/date.js");




const { abs } = Math

const V = new WeakMap()
const S = new WeakMap()

class Year extends _interface_js__WEBPACK_IMPORTED_MODULE_1__.ExtDateTime {
  constructor(input) {
    super()

    V.set(this, [])

    switch (typeof input) {
    case 'number':
      this.year = input
      break

    case 'string':
      input = Year.parse(input)

    // eslint-disable-next-line no-fallthrough
    case 'object':
      if (Array.isArray(input))
        input = { values: input }

      {
        ;(0,_assert_js__WEBPACK_IMPORTED_MODULE_0__["default"])(input !== null)
        if (input.type) _assert_js__WEBPACK_IMPORTED_MODULE_0__["default"].equal('Year', input.type)

        ;(0,_assert_js__WEBPACK_IMPORTED_MODULE_0__["default"])(input.values)
        ;(0,_assert_js__WEBPACK_IMPORTED_MODULE_0__["default"])(input.values.length)

        this.year = input.values[0]
        this.significant = input.significant
      }
      break

    case 'undefined':
      this.year = new Date().getUTCFullYear()
      break

    default:
      throw new RangeError('Invalid year value')
    }
  }

  get year() {
    return this.values[0]
  }

  set year(year) {
    this.values[0] = Number(year)
  }

  get significant() {
    return S.get(this)
  }

  set significant(digits) {
    S.set(this, Number(digits))
  }

  get values() {
    return V.get(this)
  }

  get min() {
    return _interface_js__WEBPACK_IMPORTED_MODULE_1__.ExtDateTime.UTC(this.year, 0)
  }

  get max() {
    return _interface_js__WEBPACK_IMPORTED_MODULE_1__.ExtDateTime.UTC(this.year + 1, 0) - 1
  }

  toEDTF() {
    let y = abs(this.year)
    let s = this.significant ? `S${this.significant}` : ''

    if (y <= 9999) return `${this.year < 0 ? '-' : ''}${(0,_date_js__WEBPACK_IMPORTED_MODULE_2__.pad)(this.year)}${s}`

    // TODO exponential form for ending zeroes

    return `Y${this.year}${s}`
  }
}


/***/ }),

/***/ "./node_modules/edtf/locale-data/de-DE.json":
/*!**************************************************!*\
  !*** ./node_modules/edtf/locale-data/de-DE.json ***!
  \**************************************************/
/***/ ((module) => {

"use strict";
module.exports = JSON.parse('{"locale":"de-DE","date":{"approximate":{"long":"circa %D","medium":"ca. %D","short":"ca. %D"},"uncertain":{"long":"%D (?)","medium":"%D (?)","short":"%D (?)"}}}');

/***/ }),

/***/ "./node_modules/edtf/locale-data/en-US.json":
/*!**************************************************!*\
  !*** ./node_modules/edtf/locale-data/en-US.json ***!
  \**************************************************/
/***/ ((module) => {

"use strict";
module.exports = JSON.parse('{"locale":"en-US","date":{"approximate":{"long":"circa %D","medium":"ca. %D","short":"c. %D"},"uncertain":{"long":"%D (unspecified)","medium":"%D (?)","short":"%D (?)"}}}');

/***/ }),

/***/ "./node_modules/edtf/locale-data/es-ES.json":
/*!**************************************************!*\
  !*** ./node_modules/edtf/locale-data/es-ES.json ***!
  \**************************************************/
/***/ ((module) => {

"use strict";
module.exports = JSON.parse('{"locale":"es-ES","date":{"approximate":{"long":"circa %D","medium":"ca. %D","short":"c. %D"},"uncertain":{"long":"%D (?)","medium":"%D (?)","short":"%D (?)"}}}');

/***/ }),

/***/ "./node_modules/edtf/locale-data/fr-FR.json":
/*!**************************************************!*\
  !*** ./node_modules/edtf/locale-data/fr-FR.json ***!
  \**************************************************/
/***/ ((module) => {

"use strict";
module.exports = JSON.parse('{"locale":"fr-FR","date":{"approximate":{"long":"circa %D","medium":"ca. %D","short":"c. %D"},"uncertain":{"long":"%D (?)","medium":"%D (?)","short":"%D (?)"}}}');

/***/ }),

/***/ "./node_modules/edtf/locale-data/it-IT.json":
/*!**************************************************!*\
  !*** ./node_modules/edtf/locale-data/it-IT.json ***!
  \**************************************************/
/***/ ((module) => {

"use strict";
module.exports = JSON.parse('{"locale":"it-IT","date":{"approximate":{"long":"circa %D","medium":"ca. %D","short":"c. %D"},"uncertain":{"long":"%D (?)","medium":"%D (?)","short":"%D (?)"}}}');

/***/ }),

/***/ "./node_modules/edtf/locale-data/ja-JA.json":
/*!**************************************************!*\
  !*** ./node_modules/edtf/locale-data/ja-JA.json ***!
  \**************************************************/
/***/ ((module) => {

"use strict";
module.exports = JSON.parse('{"locale":"ja-JA","date":{"approximate":{"long":"%D頃","medium":"%D頃","short":"%D頃"},"uncertain":{"long":"%D頃","medium":"%D頃","short":"%D頃"}}}');

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat get default export */
/******/ 	(() => {
/******/ 		// getDefaultExport function for compatibility with non-harmony modules
/******/ 		__webpack_require__.n = (module) => {
/******/ 			var getter = module && module.__esModule ?
/******/ 				() => (module['default']) :
/******/ 				() => (module);
/******/ 			__webpack_require__.d(getter, { a: getter });
/******/ 			return getter;
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it need to be in strict mode.
(() => {
"use strict";
/*!*******************************!*\
  !*** ./asset/src/js/index.js ***!
  \*******************************/
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   listen: () => (/* binding */ listen)
/* harmony export */ });
/* harmony import */ var edtf__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! edtf */ "./node_modules/edtf/index.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! jquery */ "jquery");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_1__);
// Path: build/html/modules/EdtfDataType/asset/src/index.js




// add listener to the #edtf-value input for changes

const parser = function(container) {

    var outputString = ""
    var shortExplanation = "";
    var caretLocation, caretOffset = 0;

    try {
        (0,edtf__WEBPACK_IMPORTED_MODULE_0__.parse)(container.value);
        jquery__WEBPACK_IMPORTED_MODULE_1___default()(container).closest('.edtf').find('.invalid-value').empty();
        const validString = 
        "<div class='valid-string-container'>" +
             "<span class='o-icon-edit icon' title='Correct value' aria-label='accepted value'></span>"+
             "<span class='valuesuggest-id'>" + container.value + "</span>" +
         "</div>";
        var validStringContainer = jquery__WEBPACK_IMPORTED_MODULE_1___default()(container).closest(".edtf").find(".valid-string-container");
        
        if(validStringContainer.length > 0) {
            jquery__WEBPACK_IMPORTED_MODULE_1___default()(validStringContainer).replaceWith(validString);
        } else {
                jquery__WEBPACK_IMPORTED_MODULE_1___default()(container).closest(".edtf").prepend(validString);
        }
        outputString, shortExplanation = "";

    } catch (e) {
        
        var message = String(e.message)

        const lines = message.split('\n');
        lines.forEach((line,i) => {
            switch (true) {
                case /Unexpected/.test(line):
                    shortExplanation = line.substring(0, line.indexOf("."));
                    break;
                case /Syntax/.test(line):
                    //console.log("-- " + lines[i+2]);
                    // get the consistently second line after the syntax error line
                    // only take the section after the space
                    outputString = lines[i+2].split(" ")[1];
                    caretOffset = lines[i+2].split(" ")[0].length + 1;
                    break;
                case /\^/.test(line):
                    //console.log("-- " + line);
                    // count the charaters in the string before the caret accounting for the spaces that are removed
                    caretLocation = line.indexOf("^") - caretOffset;
                    break                         
                default:
                    //console.log("-- " + line + "\n");
                    break
            }
        })

        // @todo if there is a match... output the human readable to the screen! Something like valuesuggest:

        if (outputString.length > 0) {
            outputString = "<div><p class='outputstring'>" + 
                outputString.substring(0, caretLocation ) +
                "<span class='caret'>" +  outputString.substring(caretLocation, caretLocation + 1) + "</span>" +
                outputString.substring(caretLocation + 1) + 
                " [" + shortExplanation + "]" +
                "</p></div>";
        }

        jquery__WEBPACK_IMPORTED_MODULE_1___default()(container).closest('.edtf').find('.invalid-value').html(outputString);
        jquery__WEBPACK_IMPORTED_MODULE_1___default()(container).closest('.edtf').find('.valid-string-container').remove();
    }
}

const addParserEventListener = function(container) {

    // take the first container in the array
    jquery__WEBPACK_IMPORTED_MODULE_1___default()(container)[0].addEventListener('input', function(e)
    {   
        parser(e.target)
    });

}

const listen = function() {
    // setup for future new instances
    jquery__WEBPACK_IMPORTED_MODULE_1___default()(document).on('o:prepare-value o:prepare-value-annotation', function(e, type, container) {
        if ('edtf:date' === type) {
            var input = container.find('.edtf-value');
            addParserEventListener(container);
        }
    });

    var inputs = document.querySelectorAll('.edtf input.edtf-value');

    
    inputs.forEach(input => {
        parser(input)
        addParserEventListener(input)
    });

}


})();

EdtfDataType = __webpack_exports__;
/******/ })()
;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,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QUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxVQUFVO0FBQ1Y7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLGFBQWE7O0FBRWI7QUFDQTtBQUNBO0FBQ0EsVUFBVTtBQUNWO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsaUJBQWlCO0FBQ2pCO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsYUFBYTtBQUNiO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSx3QkFBd0IsdUJBQXVCO0FBQy9DO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsY0FBYztBQUNkO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxTQUFTO0FBQ1QsK0NBQStDLGdCQUFnQjtBQUMvRDs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLFVBQVU7QUFDVjtBQUNBO0FBQ0EsY0FBYztBQUNkO0FBQ0EsY0FBYztBQUNkO0FBQ0EsY0FBYztBQUNkO0FBQ0EsY0FBYztBQUNkO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsVUFBVTtBQUNWO0FBQ0E7QUFDQSxjQUFjO0FBQ2Q7QUFDQSxjQUFjO0FBQ2Q7QUFDQSxjQUFjO0FBQ2Q7QUFDQSxjQUFjO0FBQ2Q7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQSxDQUFDOzs7Ozs7Ozs7Ozs7QUNuakJEOzs7Ozs7Ozs7O0FDQUEsV0FBVyxtQkFBTyxDQUFDLGdFQUFjO0FBQ2pDLFdBQVcsbUJBQU8sQ0FBQyxnRUFBYztBQUNqQyxXQUFXLG1CQUFPLENBQUMsZ0VBQWM7QUFDakMsV0FBVyxtQkFBTyxDQUFDLGdFQUFjO0FBQ2pDLFdBQVcsbUJBQU8sQ0FBQyxnRUFBYztBQUNqQyxXQUFXLG1CQUFPLENBQUMsZ0VBQWM7O0FBRWpDO0FBQ0E7QUFDQSxZQUFZLEtBQUssR0FBRyxPQUFPO0FBQzNCOztBQUVBLGVBQWU7O0FBRWY7QUFDQTtBQUNBOztBQUVBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUNsQitDO0FBQ2pCO0FBQ1k7QUFDTztBQUNUOzs7Ozs7Ozs7Ozs7Ozs7Ozs7QUNKakM7QUFDUDtBQUNBLGlCQUFpQixNQUFNO0FBQ3ZCOztBQUVPO0FBQ1A7QUFDQTtBQUNBOztBQUVBO0FBQ0E7O0FBRUE7QUFDQSxpQkFBaUIsT0FBTyxjQUFjLFNBQVM7QUFDL0M7O0FBRUE7O0FBRUEsaUVBQWUsTUFBTTs7Ozs7Ozs7Ozs7Ozs7OztBQ25CckI7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLGdDQUFnQyxFQUFFO0FBQ2xDO0FBQ0E7O0FBRUEsUUFBUSx1QkFBdUI7OztBQUcvQjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNPOztBQUVQO0FBQ0E7QUFDQTs7QUFFQSw4QkFBOEI7QUFDOUI7O0FBRUE7O0FBRUE7QUFDQTs7QUFFQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQSx3Q0FBd0MsTUFBTTtBQUM5QztBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBOztBQUVBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBOztBQUVBO0FBQ0E7OztBQUdBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBOztBQUVBLGNBQWM7O0FBRWQsZ0JBQWdCOztBQUVoQixlQUFlOzs7QUFHZjtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBLEtBQUs7QUFDTDs7QUFFQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBOztBQUVBOztBQUVBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTs7QUFFQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTs7QUFFQSxRQUFRO0FBQ1I7QUFDQTtBQUNBOztBQUVBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBOztBQUVBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTs7QUFFQTs7QUFFQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7O0FBRUE7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FB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b2R1bGVzL25lYXJsZXkvbGliL25lYXJsZXkuanMiLCJ3ZWJwYWNrOi8vRWR0ZkRhdGFUeXBlL2V4dGVybmFsIHdpbmRvdyBcImpRdWVyeVwiIiwid2VicGFjazovL0VkdGZEYXRhVHlwZS8uL25vZGVfbW9kdWxlcy9lZHRmL2xvY2FsZS1kYXRhL2luZGV4LmNqcyIsIndlYnBhY2s6Ly9FZHRmRGF0YVR5cGUvLi9ub2RlX21vZHVsZXMvZWR0Zi9pbmRleC5qcyIsIndlYnBhY2s6Ly9FZHRmRGF0YVR5cGUvLi9ub2RlX21vZHVsZXMvZWR0Zi9zcmMvYXNzZXJ0LmpzIiwid2VicGFjazovL0VkdGZEYXRhVHlwZS8uL25vZGVfbW9kdWxlcy9lZHRmL3NyYy9iaXRtYXNrLmpzIiwid2VicGFjazovL0VkdGZEYXRhVHlwZS8uL25vZGVfbW9kdWxlcy9lZHRmL3NyYy9jZW50dXJ5LmpzIiwid2VicGFjazovL0VkdGZEYXRhVHlwZS8uL25vZGVfbW9kdWxlcy9lZHRmL3NyYy9kYXRlLmpzIiwid2VicGFjazovL0VkdGZEYXRhVHlwZS8uL25vZGVfbW9kdWxlcy9lZHRmL3NyYy9kZWNhZGUuanMiLCJ3ZWJwYWNrOi8vRWR0ZkRhdGFUeXBlLy4vbm9kZV9tb2R1bGVzL2VkdGYvc3JjL2VkdGYuanMiLCJ3ZWJwYWNrOi8vRWR0ZkRhdGFUeXBlLy4vbm9kZV9tb2R1bGVzL2VkdGYvc3JjL2Zvcm1hdC5qcyIsIndlYnBhY2s6Ly9FZHRmRGF0YVR5cGUvLi9ub2RlX21vZHVsZXMvZWR0Zi9zcmMvZ3JhbW1hci5qcyIsIndlYnBhY2s6Ly9FZHRmRGF0YVR5cGUvLi9ub2RlX21vZHVsZXMvZWR0Zi9zcmMvaW50ZXJmYWNlLmpzIiwid2VicGFjazovL0VkdGZEYXRhVHlwZS8uL25vZGVfbW9kdWxlcy9lZHRmL3NyYy9pbnRlcnZhbC5qcyIsIndlYnBhY2s6Ly9FZHRmRGF0YVR5cGUvLi9ub2RlX21vZHVsZXMvZWR0Zi9zcmMvbGlzdC5qcyIsIndlYnBhY2s6Ly9FZHRmRGF0YVR5cGUvLi9ub2RlX21vZHVsZXMvZWR0Zi9zcmMvbWl4aW4uanMiLCJ3ZWJwYWNrOi8vRWR0ZkRhdGFUeXBlLy4vbm9kZV9tb2R1bGVzL2VkdGYvc3JjL3BhcnNlci5qcyIsIndlYnBhY2s6Ly9FZHRmRGF0YVR5cGUvLi9ub2RlX21vZHVsZXMvZWR0Zi9zcmMvc2Vhc29uLmpzIiwid2VicGFjazovL0VkdGZEYXRhVHlwZS8uL25vZGVfbW9kdWxlcy9lZHRmL3NyYy9zZXQuanMiLCJ3ZWJwYWNrOi8vRWR0ZkRhdGFUeXBlLy4vbm9kZV9tb2R1bGVzL2VkdGYvc3JjL3R5cGVzLmpzIiwid2VicGFjazovL0VkdGZEYXRhVHlwZS8uL25vZGVfbW9kdWxlcy9lZHRmL3NyYy91dGlsLmpzIiwid2VicGFjazovL0VkdGZEYXRhVHlwZS8uL25vZGVfbW9kdWxlcy9lZHRmL3NyYy95ZWFyLmpzIiwid2VicGFjazovL0VkdGZEYXRhVHlwZS93ZWJwYWNrL2Jvb3RzdHJhcCIsIndlYnBhY2s6Ly9FZHRmRGF0YVR5cGUvd2VicGFjay9ydW50aW1lL2NvbXBhdCBnZXQgZGVmYXVsdCBleHBvcnQiLCJ3ZWJwYWNrOi8vRWR0ZkRhdGFUeXBlL3dlYnBhY2svcnVudGltZS9kZWZpbmUgcHJvcGVydHkgZ2V0dGVycyIsIndlYnBhY2s6Ly9FZHRmRGF0YVR5cGUvd2VicGFjay9ydW50aW1lL2hhc093blByb3BlcnR5IHNob3J0aGFuZCIsIndlYnBhY2s6Ly9FZHRmRGF0YVR5cGUvd2VicGFjay9ydW50aW1lL21ha2UgbmFtZXNwYWNlIG9iamVjdCIsIndlYnBhY2s6Ly9FZHRmRGF0YVR5cGUvLi9hc3NldC9zcmMvanMvaW5kZXguanMiXSwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uKHJvb3QsIGZhY3RvcnkpIHtcbiAgICBpZiAodHlwZW9mIG1vZHVsZSA9PT0gJ29iamVjdCcgJiYgbW9kdWxlLmV4cG9ydHMpIHtcbiAgICAgICAgbW9kdWxlLmV4cG9ydHMgPSBmYWN0b3J5KCk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcm9vdC5uZWFybGV5ID0gZmFjdG9yeSgpO1xuICAgIH1cbn0odGhpcywgZnVuY3Rpb24oKSB7XG5cbiAgICBmdW5jdGlvbiBSdWxlKG5hbWUsIHN5bWJvbHMsIHBvc3Rwcm9jZXNzKSB7XG4gICAgICAgIHRoaXMuaWQgPSArK1J1bGUuaGlnaGVzdElkO1xuICAgICAgICB0aGlzLm5hbWUgPSBuYW1lO1xuICAgICAgICB0aGlzLnN5bWJvbHMgPSBzeW1ib2xzOyAgICAgICAgLy8gYSBsaXN0IG9mIGxpdGVyYWwgfCByZWdleCBjbGFzcyB8IG5vbnRlcm1pbmFsXG4gICAgICAgIHRoaXMucG9zdHByb2Nlc3MgPSBwb3N0cHJvY2VzcztcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuICAgIFJ1bGUuaGlnaGVzdElkID0gMDtcblxuICAgIFJ1bGUucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24od2l0aEN1cnNvckF0KSB7XG4gICAgICAgIHZhciBzeW1ib2xTZXF1ZW5jZSA9ICh0eXBlb2Ygd2l0aEN1cnNvckF0ID09PSBcInVuZGVmaW5lZFwiKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICA/IHRoaXMuc3ltYm9scy5tYXAoZ2V0U3ltYm9sU2hvcnREaXNwbGF5KS5qb2luKCcgJylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgOiAoICAgdGhpcy5zeW1ib2xzLnNsaWNlKDAsIHdpdGhDdXJzb3JBdCkubWFwKGdldFN5bWJvbFNob3J0RGlzcGxheSkuam9pbignICcpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICArIFwiIOKXjyBcIlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKyB0aGlzLnN5bWJvbHMuc2xpY2Uod2l0aEN1cnNvckF0KS5tYXAoZ2V0U3ltYm9sU2hvcnREaXNwbGF5KS5qb2luKCcgJykgICAgICk7XG4gICAgICAgIHJldHVybiB0aGlzLm5hbWUgKyBcIiDihpIgXCIgKyBzeW1ib2xTZXF1ZW5jZTtcbiAgICB9XG5cblxuICAgIC8vIGEgU3RhdGUgaXMgYSBydWxlIGF0IGEgcG9zaXRpb24gZnJvbSBhIGdpdmVuIHN0YXJ0aW5nIHBvaW50IGluIHRoZSBpbnB1dCBzdHJlYW0gKHJlZmVyZW5jZSlcbiAgICBmdW5jdGlvbiBTdGF0ZShydWxlLCBkb3QsIHJlZmVyZW5jZSwgd2FudGVkQnkpIHtcbiAgICAgICAgdGhpcy5ydWxlID0gcnVsZTtcbiAgICAgICAgdGhpcy5kb3QgPSBkb3Q7XG4gICAgICAgIHRoaXMucmVmZXJlbmNlID0gcmVmZXJlbmNlO1xuICAgICAgICB0aGlzLmRhdGEgPSBbXTtcbiAgICAgICAgdGhpcy53YW50ZWRCeSA9IHdhbnRlZEJ5O1xuICAgICAgICB0aGlzLmlzQ29tcGxldGUgPSB0aGlzLmRvdCA9PT0gcnVsZS5zeW1ib2xzLmxlbmd0aDtcbiAgICB9XG5cbiAgICBTdGF0ZS5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIFwie1wiICsgdGhpcy5ydWxlLnRvU3RyaW5nKHRoaXMuZG90KSArIFwifSwgZnJvbTogXCIgKyAodGhpcy5yZWZlcmVuY2UgfHwgMCk7XG4gICAgfTtcblxuICAgIFN0YXRlLnByb3RvdHlwZS5uZXh0U3RhdGUgPSBmdW5jdGlvbihjaGlsZCkge1xuICAgICAgICB2YXIgc3RhdGUgPSBuZXcgU3RhdGUodGhpcy5ydWxlLCB0aGlzLmRvdCArIDEsIHRoaXMucmVmZXJlbmNlLCB0aGlzLndhbnRlZEJ5KTtcbiAgICAgICAgc3RhdGUubGVmdCA9IHRoaXM7XG4gICAgICAgIHN0YXRlLnJpZ2h0ID0gY2hpbGQ7XG4gICAgICAgIGlmIChzdGF0ZS5pc0NvbXBsZXRlKSB7XG4gICAgICAgICAgICBzdGF0ZS5kYXRhID0gc3RhdGUuYnVpbGQoKTtcbiAgICAgICAgICAgIC8vIEhhdmluZyByaWdodCBzZXQgaGVyZSB3aWxsIHByZXZlbnQgdGhlIHJpZ2h0IHN0YXRlIGFuZCBpdHMgY2hpbGRyZW5cbiAgICAgICAgICAgIC8vIGZvcm0gYmVpbmcgZ2FyYmFnZSBjb2xsZWN0ZWRcbiAgICAgICAgICAgIHN0YXRlLnJpZ2h0ID0gdW5kZWZpbmVkO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBzdGF0ZTtcbiAgICB9O1xuXG4gICAgU3RhdGUucHJvdG90eXBlLmJ1aWxkID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBjaGlsZHJlbiA9IFtdO1xuICAgICAgICB2YXIgbm9kZSA9IHRoaXM7XG4gICAgICAgIGRvIHtcbiAgICAgICAgICAgIGNoaWxkcmVuLnB1c2gobm9kZS5yaWdodC5kYXRhKTtcbiAgICAgICAgICAgIG5vZGUgPSBub2RlLmxlZnQ7XG4gICAgICAgIH0gd2hpbGUgKG5vZGUubGVmdCk7XG4gICAgICAgIGNoaWxkcmVuLnJldmVyc2UoKTtcbiAgICAgICAgcmV0dXJuIGNoaWxkcmVuO1xuICAgIH07XG5cbiAgICBTdGF0ZS5wcm90b3R5cGUuZmluaXNoID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIGlmICh0aGlzLnJ1bGUucG9zdHByb2Nlc3MpIHtcbiAgICAgICAgICAgIHRoaXMuZGF0YSA9IHRoaXMucnVsZS5wb3N0cHJvY2Vzcyh0aGlzLmRhdGEsIHRoaXMucmVmZXJlbmNlLCBQYXJzZXIuZmFpbCk7XG4gICAgICAgIH1cbiAgICB9O1xuXG5cbiAgICBmdW5jdGlvbiBDb2x1bW4oZ3JhbW1hciwgaW5kZXgpIHtcbiAgICAgICAgdGhpcy5ncmFtbWFyID0gZ3JhbW1hcjtcbiAgICAgICAgdGhpcy5pbmRleCA9IGluZGV4O1xuICAgICAgICB0aGlzLnN0YXRlcyA9IFtdO1xuICAgICAgICB0aGlzLndhbnRzID0ge307IC8vIHN0YXRlcyBpbmRleGVkIGJ5IHRoZSBub24tdGVybWluYWwgdGhleSBleHBlY3RcbiAgICAgICAgdGhpcy5zY2FubmFibGUgPSBbXTsgLy8gbGlzdCBvZiBzdGF0ZXMgdGhhdCBleHBlY3QgYSB0b2tlblxuICAgICAgICB0aGlzLmNvbXBsZXRlZCA9IHt9OyAvLyBzdGF0ZXMgdGhhdCBhcmUgbnVsbGFibGVcbiAgICB9XG5cblxuICAgIENvbHVtbi5wcm90b3R5cGUucHJvY2VzcyA9IGZ1bmN0aW9uKG5leHRDb2x1bW4pIHtcbiAgICAgICAgdmFyIHN0YXRlcyA9IHRoaXMuc3RhdGVzO1xuICAgICAgICB2YXIgd2FudHMgPSB0aGlzLndhbnRzO1xuICAgICAgICB2YXIgY29tcGxldGVkID0gdGhpcy5jb21wbGV0ZWQ7XG5cbiAgICAgICAgZm9yICh2YXIgdyA9IDA7IHcgPCBzdGF0ZXMubGVuZ3RoOyB3KyspIHsgLy8gbmIuIHdlIHB1c2goKSBkdXJpbmcgaXRlcmF0aW9uXG4gICAgICAgICAgICB2YXIgc3RhdGUgPSBzdGF0ZXNbd107XG5cbiAgICAgICAgICAgIGlmIChzdGF0ZS5pc0NvbXBsZXRlKSB7XG4gICAgICAgICAgICAgICAgc3RhdGUuZmluaXNoKCk7XG4gICAgICAgICAgICAgICAgaWYgKHN0YXRlLmRhdGEgIT09IFBhcnNlci5mYWlsKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIGNvbXBsZXRlXG4gICAgICAgICAgICAgICAgICAgIHZhciB3YW50ZWRCeSA9IHN0YXRlLndhbnRlZEJ5O1xuICAgICAgICAgICAgICAgICAgICBmb3IgKHZhciBpID0gd2FudGVkQnkubGVuZ3RoOyBpLS07ICkgeyAvLyB0aGlzIGxpbmUgaXMgaG90XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgbGVmdCA9IHdhbnRlZEJ5W2ldO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5jb21wbGV0ZShsZWZ0LCBzdGF0ZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvLyBzcGVjaWFsLWNhc2UgbnVsbGFibGVzXG4gICAgICAgICAgICAgICAgICAgIGlmIChzdGF0ZS5yZWZlcmVuY2UgPT09IHRoaXMuaW5kZXgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIG1ha2Ugc3VyZSBmdXR1cmUgcHJlZGljdG9ycyBvZiB0aGlzIHJ1bGUgZ2V0IGNvbXBsZXRlZC5cbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBleHAgPSBzdGF0ZS5ydWxlLm5hbWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAodGhpcy5jb21wbGV0ZWRbZXhwXSA9IHRoaXMuY29tcGxldGVkW2V4cF0gfHwgW10pLnB1c2goc3RhdGUpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIHF1ZXVlIHNjYW5uYWJsZSBzdGF0ZXNcbiAgICAgICAgICAgICAgICB2YXIgZXhwID0gc3RhdGUucnVsZS5zeW1ib2xzW3N0YXRlLmRvdF07XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBleHAgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2Nhbm5hYmxlLnB1c2goc3RhdGUpO1xuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBwcmVkaWN0XG4gICAgICAgICAgICAgICAgaWYgKHdhbnRzW2V4cF0pIHtcbiAgICAgICAgICAgICAgICAgICAgd2FudHNbZXhwXS5wdXNoKHN0YXRlKTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAoY29tcGxldGVkLmhhc093blByb3BlcnR5KGV4cCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBudWxscyA9IGNvbXBsZXRlZFtleHBdO1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBudWxscy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhciByaWdodCA9IG51bGxzW2ldO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuY29tcGxldGUoc3RhdGUsIHJpZ2h0KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHdhbnRzW2V4cF0gPSBbc3RhdGVdO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnByZWRpY3QoZXhwKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBDb2x1bW4ucHJvdG90eXBlLnByZWRpY3QgPSBmdW5jdGlvbihleHApIHtcbiAgICAgICAgdmFyIHJ1bGVzID0gdGhpcy5ncmFtbWFyLmJ5TmFtZVtleHBdIHx8IFtdO1xuXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcnVsZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciByID0gcnVsZXNbaV07XG4gICAgICAgICAgICB2YXIgd2FudGVkQnkgPSB0aGlzLndhbnRzW2V4cF07XG4gICAgICAgICAgICB2YXIgcyA9IG5ldyBTdGF0ZShyLCAwLCB0aGlzLmluZGV4LCB3YW50ZWRCeSk7XG4gICAgICAgICAgICB0aGlzLnN0YXRlcy5wdXNoKHMpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgQ29sdW1uLnByb3RvdHlwZS5jb21wbGV0ZSA9IGZ1bmN0aW9uKGxlZnQsIHJpZ2h0KSB7XG4gICAgICAgIHZhciBjb3B5ID0gbGVmdC5uZXh0U3RhdGUocmlnaHQpO1xuICAgICAgICB0aGlzLnN0YXRlcy5wdXNoKGNvcHkpO1xuICAgIH1cblxuXG4gICAgZnVuY3Rpb24gR3JhbW1hcihydWxlcywgc3RhcnQpIHtcbiAgICAgICAgdGhpcy5ydWxlcyA9IHJ1bGVzO1xuICAgICAgICB0aGlzLnN0YXJ0ID0gc3RhcnQgfHwgdGhpcy5ydWxlc1swXS5uYW1lO1xuICAgICAgICB2YXIgYnlOYW1lID0gdGhpcy5ieU5hbWUgPSB7fTtcbiAgICAgICAgdGhpcy5ydWxlcy5mb3JFYWNoKGZ1bmN0aW9uKHJ1bGUpIHtcbiAgICAgICAgICAgIGlmICghYnlOYW1lLmhhc093blByb3BlcnR5KHJ1bGUubmFtZSkpIHtcbiAgICAgICAgICAgICAgICBieU5hbWVbcnVsZS5uYW1lXSA9IFtdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnlOYW1lW3J1bGUubmFtZV0ucHVzaChydWxlKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gU28gd2UgY2FuIGFsbG93IHBhc3NpbmcgKHJ1bGVzLCBzdGFydCkgZGlyZWN0bHkgdG8gUGFyc2VyIGZvciBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eVxuICAgIEdyYW1tYXIuZnJvbUNvbXBpbGVkID0gZnVuY3Rpb24ocnVsZXMsIHN0YXJ0KSB7XG4gICAgICAgIHZhciBsZXhlciA9IHJ1bGVzLkxleGVyO1xuICAgICAgICBpZiAocnVsZXMuUGFyc2VyU3RhcnQpIHtcbiAgICAgICAgICBzdGFydCA9IHJ1bGVzLlBhcnNlclN0YXJ0O1xuICAgICAgICAgIHJ1bGVzID0gcnVsZXMuUGFyc2VyUnVsZXM7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIHJ1bGVzID0gcnVsZXMubWFwKGZ1bmN0aW9uIChyKSB7IHJldHVybiAobmV3IFJ1bGUoci5uYW1lLCByLnN5bWJvbHMsIHIucG9zdHByb2Nlc3MpKTsgfSk7XG4gICAgICAgIHZhciBnID0gbmV3IEdyYW1tYXIocnVsZXMsIHN0YXJ0KTtcbiAgICAgICAgZy5sZXhlciA9IGxleGVyOyAvLyBuYi4gc3RvcmluZyBsZXhlciBvbiBHcmFtbWFyIGlzIGlmZnksIGJ1dCB1bmF2b2lkYWJsZVxuICAgICAgICByZXR1cm4gZztcbiAgICB9XG5cblxuICAgIGZ1bmN0aW9uIFN0cmVhbUxleGVyKCkge1xuICAgICAgdGhpcy5yZXNldChcIlwiKTtcbiAgICB9XG5cbiAgICBTdHJlYW1MZXhlci5wcm90b3R5cGUucmVzZXQgPSBmdW5jdGlvbihkYXRhLCBzdGF0ZSkge1xuICAgICAgICB0aGlzLmJ1ZmZlciA9IGRhdGE7XG4gICAgICAgIHRoaXMuaW5kZXggPSAwO1xuICAgICAgICB0aGlzLmxpbmUgPSBzdGF0ZSA/IHN0YXRlLmxpbmUgOiAxO1xuICAgICAgICB0aGlzLmxhc3RMaW5lQnJlYWsgPSBzdGF0ZSA/IC1zdGF0ZS5jb2wgOiAwO1xuICAgIH1cblxuICAgIFN0cmVhbUxleGVyLnByb3RvdHlwZS5uZXh0ID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIGlmICh0aGlzLmluZGV4IDwgdGhpcy5idWZmZXIubGVuZ3RoKSB7XG4gICAgICAgICAgICB2YXIgY2ggPSB0aGlzLmJ1ZmZlclt0aGlzLmluZGV4KytdO1xuICAgICAgICAgICAgaWYgKGNoID09PSAnXFxuJykge1xuICAgICAgICAgICAgICB0aGlzLmxpbmUgKz0gMTtcbiAgICAgICAgICAgICAgdGhpcy5sYXN0TGluZUJyZWFrID0gdGhpcy5pbmRleDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB7dmFsdWU6IGNofTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIFN0cmVhbUxleGVyLnByb3RvdHlwZS5zYXZlID0gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBsaW5lOiB0aGlzLmxpbmUsXG4gICAgICAgIGNvbDogdGhpcy5pbmRleCAtIHRoaXMubGFzdExpbmVCcmVhayxcbiAgICAgIH1cbiAgICB9XG5cbiAgICBTdHJlYW1MZXhlci5wcm90b3R5cGUuZm9ybWF0RXJyb3IgPSBmdW5jdGlvbih0b2tlbiwgbWVzc2FnZSkge1xuICAgICAgICAvLyBuYi4gdGhpcyBnZXRzIGNhbGxlZCBhZnRlciBjb25zdW1pbmcgdGhlIG9mZmVuZGluZyB0b2tlbixcbiAgICAgICAgLy8gc28gdGhlIGN1bHByaXQgaXMgaW5kZXgtMVxuICAgICAgICB2YXIgYnVmZmVyID0gdGhpcy5idWZmZXI7XG4gICAgICAgIGlmICh0eXBlb2YgYnVmZmVyID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgdmFyIGxpbmVzID0gYnVmZmVyXG4gICAgICAgICAgICAgICAgLnNwbGl0KFwiXFxuXCIpXG4gICAgICAgICAgICAgICAgLnNsaWNlKFxuICAgICAgICAgICAgICAgICAgICBNYXRoLm1heCgwLCB0aGlzLmxpbmUgLSA1KSwgXG4gICAgICAgICAgICAgICAgICAgIHRoaXMubGluZVxuICAgICAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgIHZhciBuZXh0TGluZUJyZWFrID0gYnVmZmVyLmluZGV4T2YoJ1xcbicsIHRoaXMuaW5kZXgpO1xuICAgICAgICAgICAgaWYgKG5leHRMaW5lQnJlYWsgPT09IC0xKSBuZXh0TGluZUJyZWFrID0gYnVmZmVyLmxlbmd0aDtcbiAgICAgICAgICAgIHZhciBjb2wgPSB0aGlzLmluZGV4IC0gdGhpcy5sYXN0TGluZUJyZWFrO1xuICAgICAgICAgICAgdmFyIGxhc3RMaW5lRGlnaXRzID0gU3RyaW5nKHRoaXMubGluZSkubGVuZ3RoO1xuICAgICAgICAgICAgbWVzc2FnZSArPSBcIiBhdCBsaW5lIFwiICsgdGhpcy5saW5lICsgXCIgY29sIFwiICsgY29sICsgXCI6XFxuXFxuXCI7XG4gICAgICAgICAgICBtZXNzYWdlICs9IGxpbmVzXG4gICAgICAgICAgICAgICAgLm1hcChmdW5jdGlvbihsaW5lLCBpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBwYWQodGhpcy5saW5lIC0gbGluZXMubGVuZ3RoICsgaSArIDEsIGxhc3RMaW5lRGlnaXRzKSArIFwiIFwiICsgbGluZTtcbiAgICAgICAgICAgICAgICB9LCB0aGlzKVxuICAgICAgICAgICAgICAgIC5qb2luKFwiXFxuXCIpO1xuICAgICAgICAgICAgbWVzc2FnZSArPSBcIlxcblwiICsgcGFkKFwiXCIsIGxhc3RMaW5lRGlnaXRzICsgY29sKSArIFwiXlxcblwiO1xuICAgICAgICAgICAgcmV0dXJuIG1lc3NhZ2U7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gbWVzc2FnZSArIFwiIGF0IGluZGV4IFwiICsgKHRoaXMuaW5kZXggLSAxKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIHBhZChuLCBsZW5ndGgpIHtcbiAgICAgICAgICAgIHZhciBzID0gU3RyaW5nKG4pO1xuICAgICAgICAgICAgcmV0dXJuIEFycmF5KGxlbmd0aCAtIHMubGVuZ3RoICsgMSkuam9pbihcIiBcIikgKyBzO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gUGFyc2VyKHJ1bGVzLCBzdGFydCwgb3B0aW9ucykge1xuICAgICAgICBpZiAocnVsZXMgaW5zdGFuY2VvZiBHcmFtbWFyKSB7XG4gICAgICAgICAgICB2YXIgZ3JhbW1hciA9IHJ1bGVzO1xuICAgICAgICAgICAgdmFyIG9wdGlvbnMgPSBzdGFydDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhciBncmFtbWFyID0gR3JhbW1hci5mcm9tQ29tcGlsZWQocnVsZXMsIHN0YXJ0KTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmdyYW1tYXIgPSBncmFtbWFyO1xuXG4gICAgICAgIC8vIFJlYWQgb3B0aW9uc1xuICAgICAgICB0aGlzLm9wdGlvbnMgPSB7XG4gICAgICAgICAgICBrZWVwSGlzdG9yeTogZmFsc2UsXG4gICAgICAgICAgICBsZXhlcjogZ3JhbW1hci5sZXhlciB8fCBuZXcgU3RyZWFtTGV4ZXIsXG4gICAgICAgIH07XG4gICAgICAgIGZvciAodmFyIGtleSBpbiAob3B0aW9ucyB8fCB7fSkpIHtcbiAgICAgICAgICAgIHRoaXMub3B0aW9uc1trZXldID0gb3B0aW9uc1trZXldO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gU2V0dXAgbGV4ZXJcbiAgICAgICAgdGhpcy5sZXhlciA9IHRoaXMub3B0aW9ucy5sZXhlcjtcbiAgICAgICAgdGhpcy5sZXhlclN0YXRlID0gdW5kZWZpbmVkO1xuXG4gICAgICAgIC8vIFNldHVwIGEgdGFibGVcbiAgICAgICAgdmFyIGNvbHVtbiA9IG5ldyBDb2x1bW4oZ3JhbW1hciwgMCk7XG4gICAgICAgIHZhciB0YWJsZSA9IHRoaXMudGFibGUgPSBbY29sdW1uXTtcblxuICAgICAgICAvLyBJIGNvdWxkIGJlIGV4cGVjdGluZyBhbnl0aGluZy5cbiAgICAgICAgY29sdW1uLndhbnRzW2dyYW1tYXIuc3RhcnRdID0gW107XG4gICAgICAgIGNvbHVtbi5wcmVkaWN0KGdyYW1tYXIuc3RhcnQpO1xuICAgICAgICAvLyBUT0RPIHdoYXQgaWYgc3RhcnQgcnVsZSBpcyBudWxsYWJsZT9cbiAgICAgICAgY29sdW1uLnByb2Nlc3MoKTtcbiAgICAgICAgdGhpcy5jdXJyZW50ID0gMDsgLy8gdG9rZW4gaW5kZXhcbiAgICB9XG5cbiAgICAvLyBjcmVhdGUgYSByZXNlcnZlZCB0b2tlbiBmb3IgaW5kaWNhdGluZyBhIHBhcnNlIGZhaWxcbiAgICBQYXJzZXIuZmFpbCA9IHt9O1xuXG4gICAgUGFyc2VyLnByb3RvdHlwZS5mZWVkID0gZnVuY3Rpb24oY2h1bmspIHtcbiAgICAgICAgdmFyIGxleGVyID0gdGhpcy5sZXhlcjtcbiAgICAgICAgbGV4ZXIucmVzZXQoY2h1bmssIHRoaXMubGV4ZXJTdGF0ZSk7XG5cbiAgICAgICAgdmFyIHRva2VuO1xuICAgICAgICB3aGlsZSAodHJ1ZSkge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICB0b2tlbiA9IGxleGVyLm5leHQoKTtcbiAgICAgICAgICAgICAgICBpZiAoIXRva2VuKSB7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICAvLyBDcmVhdGUgdGhlIG5leHQgY29sdW1uIHNvIHRoYXQgdGhlIGVycm9yIHJlcG9ydGVyXG4gICAgICAgICAgICAgICAgLy8gY2FuIGRpc3BsYXkgdGhlIGNvcnJlY3RseSBwcmVkaWN0ZWQgc3RhdGVzLlxuICAgICAgICAgICAgICAgIHZhciBuZXh0Q29sdW1uID0gbmV3IENvbHVtbih0aGlzLmdyYW1tYXIsIHRoaXMuY3VycmVudCArIDEpO1xuICAgICAgICAgICAgICAgIHRoaXMudGFibGUucHVzaChuZXh0Q29sdW1uKTtcbiAgICAgICAgICAgICAgICB2YXIgZXJyID0gbmV3IEVycm9yKHRoaXMucmVwb3J0TGV4ZXJFcnJvcihlKSk7XG4gICAgICAgICAgICAgICAgZXJyLm9mZnNldCA9IHRoaXMuY3VycmVudDtcbiAgICAgICAgICAgICAgICBlcnIudG9rZW4gPSBlLnRva2VuO1xuICAgICAgICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIFdlIGFkZCBuZXcgc3RhdGVzIHRvIHRhYmxlW2N1cnJlbnQrMV1cbiAgICAgICAgICAgIHZhciBjb2x1bW4gPSB0aGlzLnRhYmxlW3RoaXMuY3VycmVudF07XG5cbiAgICAgICAgICAgIC8vIEdDIHVudXNlZCBzdGF0ZXNcbiAgICAgICAgICAgIGlmICghdGhpcy5vcHRpb25zLmtlZXBIaXN0b3J5KSB7XG4gICAgICAgICAgICAgICAgZGVsZXRlIHRoaXMudGFibGVbdGhpcy5jdXJyZW50IC0gMV07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBuID0gdGhpcy5jdXJyZW50ICsgMTtcbiAgICAgICAgICAgIHZhciBuZXh0Q29sdW1uID0gbmV3IENvbHVtbih0aGlzLmdyYW1tYXIsIG4pO1xuICAgICAgICAgICAgdGhpcy50YWJsZS5wdXNoKG5leHRDb2x1bW4pO1xuXG4gICAgICAgICAgICAvLyBBZHZhbmNlIGFsbCB0b2tlbnMgdGhhdCBleHBlY3QgdGhlIHN5bWJvbFxuICAgICAgICAgICAgdmFyIGxpdGVyYWwgPSB0b2tlbi50ZXh0ICE9PSB1bmRlZmluZWQgPyB0b2tlbi50ZXh0IDogdG9rZW4udmFsdWU7XG4gICAgICAgICAgICB2YXIgdmFsdWUgPSBsZXhlci5jb25zdHJ1Y3RvciA9PT0gU3RyZWFtTGV4ZXIgPyB0b2tlbi52YWx1ZSA6IHRva2VuO1xuICAgICAgICAgICAgdmFyIHNjYW5uYWJsZSA9IGNvbHVtbi5zY2FubmFibGU7XG4gICAgICAgICAgICBmb3IgKHZhciB3ID0gc2Nhbm5hYmxlLmxlbmd0aDsgdy0tOyApIHtcbiAgICAgICAgICAgICAgICB2YXIgc3RhdGUgPSBzY2FubmFibGVbd107XG4gICAgICAgICAgICAgICAgdmFyIGV4cGVjdCA9IHN0YXRlLnJ1bGUuc3ltYm9sc1tzdGF0ZS5kb3RdO1xuICAgICAgICAgICAgICAgIC8vIFRyeSB0byBjb25zdW1lIHRoZSB0b2tlblxuICAgICAgICAgICAgICAgIC8vIGVpdGhlciByZWdleCBvciBsaXRlcmFsXG4gICAgICAgICAgICAgICAgaWYgKGV4cGVjdC50ZXN0ID8gZXhwZWN0LnRlc3QodmFsdWUpIDpcbiAgICAgICAgICAgICAgICAgICAgZXhwZWN0LnR5cGUgPyBleHBlY3QudHlwZSA9PT0gdG9rZW4udHlwZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA6IGV4cGVjdC5saXRlcmFsID09PSBsaXRlcmFsKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIEFkZCBpdFxuICAgICAgICAgICAgICAgICAgICB2YXIgbmV4dCA9IHN0YXRlLm5leHRTdGF0ZSh7ZGF0YTogdmFsdWUsIHRva2VuOiB0b2tlbiwgaXNUb2tlbjogdHJ1ZSwgcmVmZXJlbmNlOiBuIC0gMX0pO1xuICAgICAgICAgICAgICAgICAgICBuZXh0Q29sdW1uLnN0YXRlcy5wdXNoKG5leHQpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gTmV4dCwgZm9yIGVhY2ggb2YgdGhlIHJ1bGVzLCB3ZSBlaXRoZXJcbiAgICAgICAgICAgIC8vIChhKSBjb21wbGV0ZSBpdCwgYW5kIHRyeSB0byBzZWUgaWYgdGhlIHJlZmVyZW5jZSByb3cgZXhwZWN0ZWQgdGhhdFxuICAgICAgICAgICAgLy8gICAgIHJ1bGVcbiAgICAgICAgICAgIC8vIChiKSBwcmVkaWN0IHRoZSBuZXh0IG5vbnRlcm1pbmFsIGl0IGV4cGVjdHMgYnkgYWRkaW5nIHRoYXRcbiAgICAgICAgICAgIC8vICAgICBub250ZXJtaW5hbCdzIHN0YXJ0IHN0YXRlXG4gICAgICAgICAgICAvLyBUbyBwcmV2ZW50IGR1cGxpY2F0aW9uLCB3ZSBhbHNvIGtlZXAgdHJhY2sgb2YgcnVsZXMgd2UgaGF2ZSBhbHJlYWR5XG4gICAgICAgICAgICAvLyBhZGRlZFxuXG4gICAgICAgICAgICBuZXh0Q29sdW1uLnByb2Nlc3MoKTtcblxuICAgICAgICAgICAgLy8gSWYgbmVlZGVkLCB0aHJvdyBhbiBlcnJvcjpcbiAgICAgICAgICAgIGlmIChuZXh0Q29sdW1uLnN0YXRlcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICAvLyBObyBzdGF0ZXMgYXQgYWxsISBUaGlzIGlzIG5vdCBnb29kLlxuICAgICAgICAgICAgICAgIHZhciBlcnIgPSBuZXcgRXJyb3IodGhpcy5yZXBvcnRFcnJvcih0b2tlbikpO1xuICAgICAgICAgICAgICAgIGVyci5vZmZzZXQgPSB0aGlzLmN1cnJlbnQ7XG4gICAgICAgICAgICAgICAgZXJyLnRva2VuID0gdG9rZW47XG4gICAgICAgICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBtYXliZSBzYXZlIGxleGVyIHN0YXRlXG4gICAgICAgICAgICBpZiAodGhpcy5vcHRpb25zLmtlZXBIaXN0b3J5KSB7XG4gICAgICAgICAgICAgIGNvbHVtbi5sZXhlclN0YXRlID0gbGV4ZXIuc2F2ZSgpXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuY3VycmVudCsrO1xuICAgICAgICB9XG4gICAgICAgIGlmIChjb2x1bW4pIHtcbiAgICAgICAgICB0aGlzLmxleGVyU3RhdGUgPSBsZXhlci5zYXZlKClcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEluY3JlbWVudGFsbHkga2VlcCB0cmFjayBvZiByZXN1bHRzXG4gICAgICAgIHRoaXMucmVzdWx0cyA9IHRoaXMuZmluaXNoKCk7XG5cbiAgICAgICAgLy8gQWxsb3cgY2hhaW5pbmcsIGZvciB3aGF0ZXZlciBpdCdzIHdvcnRoXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH07XG5cbiAgICBQYXJzZXIucHJvdG90eXBlLnJlcG9ydExleGVyRXJyb3IgPSBmdW5jdGlvbihsZXhlckVycm9yKSB7XG4gICAgICAgIHZhciB0b2tlbkRpc3BsYXksIGxleGVyTWVzc2FnZTtcbiAgICAgICAgLy8gUGxhbm5pbmcgdG8gYWRkIGEgdG9rZW4gcHJvcGVydHkgdG8gbW9vJ3MgdGhyb3duIGVycm9yXG4gICAgICAgIC8vIGV2ZW4gb24gZXJyb3JpbmcgdG9rZW5zIHRvIGJlIHVzZWQgaW4gZXJyb3IgZGlzcGxheSBiZWxvd1xuICAgICAgICB2YXIgdG9rZW4gPSBsZXhlckVycm9yLnRva2VuO1xuICAgICAgICBpZiAodG9rZW4pIHtcbiAgICAgICAgICAgIHRva2VuRGlzcGxheSA9IFwiaW5wdXQgXCIgKyBKU09OLnN0cmluZ2lmeSh0b2tlbi50ZXh0WzBdKSArIFwiIChsZXhlciBlcnJvcilcIjtcbiAgICAgICAgICAgIGxleGVyTWVzc2FnZSA9IHRoaXMubGV4ZXIuZm9ybWF0RXJyb3IodG9rZW4sIFwiU3ludGF4IGVycm9yXCIpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdG9rZW5EaXNwbGF5ID0gXCJpbnB1dCAobGV4ZXIgZXJyb3IpXCI7XG4gICAgICAgICAgICBsZXhlck1lc3NhZ2UgPSBsZXhlckVycm9yLm1lc3NhZ2U7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMucmVwb3J0RXJyb3JDb21tb24obGV4ZXJNZXNzYWdlLCB0b2tlbkRpc3BsYXkpO1xuICAgIH07XG5cbiAgICBQYXJzZXIucHJvdG90eXBlLnJlcG9ydEVycm9yID0gZnVuY3Rpb24odG9rZW4pIHtcbiAgICAgICAgdmFyIHRva2VuRGlzcGxheSA9ICh0b2tlbi50eXBlID8gdG9rZW4udHlwZSArIFwiIHRva2VuOiBcIiA6IFwiXCIpICsgSlNPTi5zdHJpbmdpZnkodG9rZW4udmFsdWUgIT09IHVuZGVmaW5lZCA/IHRva2VuLnZhbHVlIDogdG9rZW4pO1xuICAgICAgICB2YXIgbGV4ZXJNZXNzYWdlID0gdGhpcy5sZXhlci5mb3JtYXRFcnJvcih0b2tlbiwgXCJTeW50YXggZXJyb3JcIik7XG4gICAgICAgIHJldHVybiB0aGlzLnJlcG9ydEVycm9yQ29tbW9uKGxleGVyTWVzc2FnZSwgdG9rZW5EaXNwbGF5KTtcbiAgICB9O1xuXG4gICAgUGFyc2VyLnByb3RvdHlwZS5yZXBvcnRFcnJvckNvbW1vbiA9IGZ1bmN0aW9uKGxleGVyTWVzc2FnZSwgdG9rZW5EaXNwbGF5KSB7XG4gICAgICAgIHZhciBsaW5lcyA9IFtdO1xuICAgICAgICBsaW5lcy5wdXNoKGxleGVyTWVzc2FnZSk7XG4gICAgICAgIHZhciBsYXN0Q29sdW1uSW5kZXggPSB0aGlzLnRhYmxlLmxlbmd0aCAtIDI7XG4gICAgICAgIHZhciBsYXN0Q29sdW1uID0gdGhpcy50YWJsZVtsYXN0Q29sdW1uSW5kZXhdO1xuICAgICAgICB2YXIgZXhwZWN0YW50U3RhdGVzID0gbGFzdENvbHVtbi5zdGF0ZXNcbiAgICAgICAgICAgIC5maWx0ZXIoZnVuY3Rpb24oc3RhdGUpIHtcbiAgICAgICAgICAgICAgICB2YXIgbmV4dFN5bWJvbCA9IHN0YXRlLnJ1bGUuc3ltYm9sc1tzdGF0ZS5kb3RdO1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXh0U3ltYm9sICYmIHR5cGVvZiBuZXh0U3ltYm9sICE9PSBcInN0cmluZ1wiO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgaWYgKGV4cGVjdGFudFN0YXRlcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIGxpbmVzLnB1c2goJ1VuZXhwZWN0ZWQgJyArIHRva2VuRGlzcGxheSArICcuIEkgZGlkIG5vdCBleHBlY3QgYW55IG1vcmUgaW5wdXQuIEhlcmUgaXMgdGhlIHN0YXRlIG9mIG15IHBhcnNlIHRhYmxlOlxcbicpO1xuICAgICAgICAgICAgdGhpcy5kaXNwbGF5U3RhdGVTdGFjayhsYXN0Q29sdW1uLnN0YXRlcywgbGluZXMpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbGluZXMucHVzaCgnVW5leHBlY3RlZCAnICsgdG9rZW5EaXNwbGF5ICsgJy4gSW5zdGVhZCwgSSB3YXMgZXhwZWN0aW5nIHRvIHNlZSBvbmUgb2YgdGhlIGZvbGxvd2luZzpcXG4nKTtcbiAgICAgICAgICAgIC8vIERpc3BsYXkgYSBcInN0YXRlIHN0YWNrXCIgZm9yIGVhY2ggZXhwZWN0YW50IHN0YXRlXG4gICAgICAgICAgICAvLyAtIHdoaWNoIHNob3dzIHlvdSBob3cgdGhpcyBzdGF0ZSBjYW1lIHRvIGJlLCBzdGVwIGJ5IHN0ZXAuXG4gICAgICAgICAgICAvLyBJZiB0aGVyZSBpcyBtb3JlIHRoYW4gb25lIGRlcml2YXRpb24sIHdlIG9ubHkgZGlzcGxheSB0aGUgZmlyc3Qgb25lLlxuICAgICAgICAgICAgdmFyIHN0YXRlU3RhY2tzID0gZXhwZWN0YW50U3RhdGVzXG4gICAgICAgICAgICAgICAgLm1hcChmdW5jdGlvbihzdGF0ZSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5idWlsZEZpcnN0U3RhdGVTdGFjayhzdGF0ZSwgW10pIHx8IFtzdGF0ZV07XG4gICAgICAgICAgICAgICAgfSwgdGhpcyk7XG4gICAgICAgICAgICAvLyBEaXNwbGF5IGVhY2ggc3RhdGUgdGhhdCBpcyBleHBlY3RpbmcgYSB0ZXJtaW5hbCBzeW1ib2wgbmV4dC5cbiAgICAgICAgICAgIHN0YXRlU3RhY2tzLmZvckVhY2goZnVuY3Rpb24oc3RhdGVTdGFjaykge1xuICAgICAgICAgICAgICAgIHZhciBzdGF0ZSA9IHN0YXRlU3RhY2tbMF07XG4gICAgICAgICAgICAgICAgdmFyIG5leHRTeW1ib2wgPSBzdGF0ZS5ydWxlLnN5bWJvbHNbc3RhdGUuZG90XTtcbiAgICAgICAgICAgICAgICB2YXIgc3ltYm9sRGlzcGxheSA9IHRoaXMuZ2V0U3ltYm9sRGlzcGxheShuZXh0U3ltYm9sKTtcbiAgICAgICAgICAgICAgICBsaW5lcy5wdXNoKCdBICcgKyBzeW1ib2xEaXNwbGF5ICsgJyBiYXNlZCBvbjonKTtcbiAgICAgICAgICAgICAgICB0aGlzLmRpc3BsYXlTdGF0ZVN0YWNrKHN0YXRlU3RhY2ssIGxpbmVzKTtcbiAgICAgICAgICAgIH0sIHRoaXMpO1xuICAgICAgICB9XG4gICAgICAgIGxpbmVzLnB1c2goXCJcIik7XG4gICAgICAgIHJldHVybiBsaW5lcy5qb2luKFwiXFxuXCIpO1xuICAgIH1cbiAgICBcbiAgICBQYXJzZXIucHJvdG90eXBlLmRpc3BsYXlTdGF0ZVN0YWNrID0gZnVuY3Rpb24oc3RhdGVTdGFjaywgbGluZXMpIHtcbiAgICAgICAgdmFyIGxhc3REaXNwbGF5O1xuICAgICAgICB2YXIgc2FtZURpc3BsYXlDb3VudCA9IDA7XG4gICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgc3RhdGVTdGFjay5sZW5ndGg7IGorKykge1xuICAgICAgICAgICAgdmFyIHN0YXRlID0gc3RhdGVTdGFja1tqXTtcbiAgICAgICAgICAgIHZhciBkaXNwbGF5ID0gc3RhdGUucnVsZS50b1N0cmluZyhzdGF0ZS5kb3QpO1xuICAgICAgICAgICAgaWYgKGRpc3BsYXkgPT09IGxhc3REaXNwbGF5KSB7XG4gICAgICAgICAgICAgICAgc2FtZURpc3BsYXlDb3VudCsrO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBpZiAoc2FtZURpc3BsYXlDb3VudCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgbGluZXMucHVzaCgnICAgIF4gJyArIHNhbWVEaXNwbGF5Q291bnQgKyAnIG1vcmUgbGluZXMgaWRlbnRpY2FsIHRvIHRoaXMnKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgc2FtZURpc3BsYXlDb3VudCA9IDA7XG4gICAgICAgICAgICAgICAgbGluZXMucHVzaCgnICAgICcgKyBkaXNwbGF5KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGxhc3REaXNwbGF5ID0gZGlzcGxheTtcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICBQYXJzZXIucHJvdG90eXBlLmdldFN5bWJvbERpc3BsYXkgPSBmdW5jdGlvbihzeW1ib2wpIHtcbiAgICAgICAgcmV0dXJuIGdldFN5bWJvbExvbmdEaXNwbGF5KHN5bWJvbCk7XG4gICAgfTtcblxuICAgIC8qXG4gICAgQnVpbGRzIGEgdGhlIGZpcnN0IHN0YXRlIHN0YWNrLiBZb3UgY2FuIHRoaW5rIG9mIGEgc3RhdGUgc3RhY2sgYXMgdGhlIGNhbGwgc3RhY2tcbiAgICBvZiB0aGUgcmVjdXJzaXZlLWRlc2NlbnQgcGFyc2VyIHdoaWNoIHRoZSBOZWFybGV5IHBhcnNlIGFsZ29yaXRobSBzaW11bGF0ZXMuXG4gICAgQSBzdGF0ZSBzdGFjayBpcyByZXByZXNlbnRlZCBhcyBhbiBhcnJheSBvZiBzdGF0ZSBvYmplY3RzLiBXaXRoaW4gYVxuICAgIHN0YXRlIHN0YWNrLCB0aGUgZmlyc3QgaXRlbSBvZiB0aGUgYXJyYXkgd2lsbCBiZSB0aGUgc3RhcnRpbmdcbiAgICBzdGF0ZSwgd2l0aCBlYWNoIHN1Y2Nlc3NpdmUgaXRlbSBpbiB0aGUgYXJyYXkgZ29pbmcgZnVydGhlciBiYWNrIGludG8gaGlzdG9yeS5cblxuICAgIFRoaXMgZnVuY3Rpb24gbmVlZHMgdG8gYmUgZ2l2ZW4gYSBzdGFydGluZyBzdGF0ZSBhbmQgYW4gZW1wdHkgYXJyYXkgcmVwcmVzZW50aW5nXG4gICAgdGhlIHZpc2l0ZWQgc3RhdGVzLCBhbmQgaXQgcmV0dXJucyBhbiBzaW5nbGUgc3RhdGUgc3RhY2suXG5cbiAgICAqL1xuICAgIFBhcnNlci5wcm90b3R5cGUuYnVpbGRGaXJzdFN0YXRlU3RhY2sgPSBmdW5jdGlvbihzdGF0ZSwgdmlzaXRlZCkge1xuICAgICAgICBpZiAodmlzaXRlZC5pbmRleE9mKHN0YXRlKSAhPT0gLTEpIHtcbiAgICAgICAgICAgIC8vIEZvdW5kIGN5Y2xlLCByZXR1cm4gbnVsbFxuICAgICAgICAgICAgLy8gdG8gZWxpbWluYXRlIHRoaXMgcGF0aCBmcm9tIHRoZSByZXN1bHRzLCBiZWNhdXNlXG4gICAgICAgICAgICAvLyB3ZSBkb24ndCBrbm93IGhvdyB0byBkaXNwbGF5IGl0IG1lYW5pbmdmdWxseVxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHN0YXRlLndhbnRlZEJ5Lmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgcmV0dXJuIFtzdGF0ZV07XG4gICAgICAgIH1cbiAgICAgICAgdmFyIHByZXZTdGF0ZSA9IHN0YXRlLndhbnRlZEJ5WzBdO1xuICAgICAgICB2YXIgY2hpbGRWaXNpdGVkID0gW3N0YXRlXS5jb25jYXQodmlzaXRlZCk7XG4gICAgICAgIHZhciBjaGlsZFJlc3VsdCA9IHRoaXMuYnVpbGRGaXJzdFN0YXRlU3RhY2socHJldlN0YXRlLCBjaGlsZFZpc2l0ZWQpO1xuICAgICAgICBpZiAoY2hpbGRSZXN1bHQgPT09IG51bGwpIHtcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBbc3RhdGVdLmNvbmNhdChjaGlsZFJlc3VsdCk7XG4gICAgfTtcblxuICAgIFBhcnNlci5wcm90b3R5cGUuc2F2ZSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgY29sdW1uID0gdGhpcy50YWJsZVt0aGlzLmN1cnJlbnRdO1xuICAgICAgICBjb2x1bW4ubGV4ZXJTdGF0ZSA9IHRoaXMubGV4ZXJTdGF0ZTtcbiAgICAgICAgcmV0dXJuIGNvbHVtbjtcbiAgICB9O1xuXG4gICAgUGFyc2VyLnByb3RvdHlwZS5yZXN0b3JlID0gZnVuY3Rpb24oY29sdW1uKSB7XG4gICAgICAgIHZhciBpbmRleCA9IGNvbHVtbi5pbmRleDtcbiAgICAgICAgdGhpcy5jdXJyZW50ID0gaW5kZXg7XG4gICAgICAgIHRoaXMudGFibGVbaW5kZXhdID0gY29sdW1uO1xuICAgICAgICB0aGlzLnRhYmxlLnNwbGljZShpbmRleCArIDEpO1xuICAgICAgICB0aGlzLmxleGVyU3RhdGUgPSBjb2x1bW4ubGV4ZXJTdGF0ZTtcblxuICAgICAgICAvLyBJbmNyZW1lbnRhbGx5IGtlZXAgdHJhY2sgb2YgcmVzdWx0c1xuICAgICAgICB0aGlzLnJlc3VsdHMgPSB0aGlzLmZpbmlzaCgpO1xuICAgIH07XG5cbiAgICAvLyBuYi4gZGVwcmVjYXRlZDogdXNlIHNhdmUvcmVzdG9yZSBpbnN0ZWFkIVxuICAgIFBhcnNlci5wcm90b3R5cGUucmV3aW5kID0gZnVuY3Rpb24oaW5kZXgpIHtcbiAgICAgICAgaWYgKCF0aGlzLm9wdGlvbnMua2VlcEhpc3RvcnkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignc2V0IG9wdGlvbiBga2VlcEhpc3RvcnlgIHRvIGVuYWJsZSByZXdpbmRpbmcnKVxuICAgICAgICB9XG4gICAgICAgIC8vIG5iLiByZWNhbGwgY29sdW1uICh0YWJsZSkgaW5kaWNpZXMgZmFsbCBiZXR3ZWVuIHRva2VuIGluZGljaWVzLlxuICAgICAgICAvLyAgICAgICAgY29sIDAgICAtLSAgIHRva2VuIDAgICAtLSAgIGNvbCAxXG4gICAgICAgIHRoaXMucmVzdG9yZSh0aGlzLnRhYmxlW2luZGV4XSk7XG4gICAgfTtcblxuICAgIFBhcnNlci5wcm90b3R5cGUuZmluaXNoID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIC8vIFJldHVybiB0aGUgcG9zc2libGUgcGFyc2luZ3NcbiAgICAgICAgdmFyIGNvbnNpZGVyYXRpb25zID0gW107XG4gICAgICAgIHZhciBzdGFydCA9IHRoaXMuZ3JhbW1hci5zdGFydDtcbiAgICAgICAgdmFyIGNvbHVtbiA9IHRoaXMudGFibGVbdGhpcy50YWJsZS5sZW5ndGggLSAxXVxuICAgICAgICBjb2x1bW4uc3RhdGVzLmZvckVhY2goZnVuY3Rpb24gKHQpIHtcbiAgICAgICAgICAgIGlmICh0LnJ1bGUubmFtZSA9PT0gc3RhcnRcbiAgICAgICAgICAgICAgICAgICAgJiYgdC5kb3QgPT09IHQucnVsZS5zeW1ib2xzLmxlbmd0aFxuICAgICAgICAgICAgICAgICAgICAmJiB0LnJlZmVyZW5jZSA9PT0gMFxuICAgICAgICAgICAgICAgICAgICAmJiB0LmRhdGEgIT09IFBhcnNlci5mYWlsKSB7XG4gICAgICAgICAgICAgICAgY29uc2lkZXJhdGlvbnMucHVzaCh0KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBjb25zaWRlcmF0aW9ucy5tYXAoZnVuY3Rpb24oYykge3JldHVybiBjLmRhdGE7IH0pO1xuICAgIH07XG5cbiAgICBmdW5jdGlvbiBnZXRTeW1ib2xMb25nRGlzcGxheShzeW1ib2wpIHtcbiAgICAgICAgdmFyIHR5cGUgPSB0eXBlb2Ygc3ltYm9sO1xuICAgICAgICBpZiAodHlwZSA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgcmV0dXJuIHN5bWJvbDtcbiAgICAgICAgfSBlbHNlIGlmICh0eXBlID09PSBcIm9iamVjdFwiKSB7XG4gICAgICAgICAgICBpZiAoc3ltYm9sLmxpdGVyYWwpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gSlNPTi5zdHJpbmdpZnkoc3ltYm9sLmxpdGVyYWwpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChzeW1ib2wgaW5zdGFuY2VvZiBSZWdFeHApIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gJ2NoYXJhY3RlciBtYXRjaGluZyAnICsgc3ltYm9sO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChzeW1ib2wudHlwZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBzeW1ib2wudHlwZSArICcgdG9rZW4nO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChzeW1ib2wudGVzdCkge1xuICAgICAgICAgICAgICAgIHJldHVybiAndG9rZW4gbWF0Y2hpbmcgJyArIFN0cmluZyhzeW1ib2wudGVzdCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignVW5rbm93biBzeW1ib2wgdHlwZTogJyArIHN5bWJvbCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRTeW1ib2xTaG9ydERpc3BsYXkoc3ltYm9sKSB7XG4gICAgICAgIHZhciB0eXBlID0gdHlwZW9mIHN5bWJvbDtcbiAgICAgICAgaWYgKHR5cGUgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIHJldHVybiBzeW1ib2w7XG4gICAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gXCJvYmplY3RcIikge1xuICAgICAgICAgICAgaWYgKHN5bWJvbC5saXRlcmFsKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KHN5bWJvbC5saXRlcmFsKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoc3ltYm9sIGluc3RhbmNlb2YgUmVnRXhwKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHN5bWJvbC50b1N0cmluZygpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChzeW1ib2wudHlwZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiAnJScgKyBzeW1ib2wudHlwZTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoc3ltYm9sLnRlc3QpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gJzwnICsgU3RyaW5nKHN5bWJvbC50ZXN0KSArICc+JztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbmtub3duIHN5bWJvbCB0eXBlOiAnICsgc3ltYm9sKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICAgIFBhcnNlcjogUGFyc2VyLFxuICAgICAgICBHcmFtbWFyOiBHcmFtbWFyLFxuICAgICAgICBSdWxlOiBSdWxlLFxuICAgIH07XG5cbn0pKTtcbiIsIm1vZHVsZS5leHBvcnRzID0gd2luZG93W1wialF1ZXJ5XCJdOyIsImNvbnN0IGVuID0gcmVxdWlyZSgnLi9lbi1VUy5qc29uJylcbmNvbnN0IGVzID0gcmVxdWlyZSgnLi9lcy1FUy5qc29uJylcbmNvbnN0IGRlID0gcmVxdWlyZSgnLi9kZS1ERS5qc29uJylcbmNvbnN0IGZyID0gcmVxdWlyZSgnLi9mci1GUi5qc29uJylcbmNvbnN0IGl0ID0gcmVxdWlyZSgnLi9pdC1JVC5qc29uJylcbmNvbnN0IGphID0gcmVxdWlyZSgnLi9qYS1KQS5qc29uJylcblxuY29uc3QgYWxpYXMgPSAobGFuZywgLi4ucmVnaW9ucykgPT4ge1xuICBmb3IgKGxldCByZWdpb24gb2YgcmVnaW9ucylcbiAgICBkYXRhW2Ake2xhbmd9LSR7cmVnaW9ufWBdID0gZGF0YVtsYW5nXVxufVxuXG5jb25zdCBkYXRhID0geyBlbiwgZXMsIGRlLCBmciwgaXQsIGphIH1cblxuYWxpYXMoJ2VuJywgJ0FVJywgJ0NBJywgJ0dCJywgJ05aJywgJ1NBJywgJ1VTJylcbmFsaWFzKCdkZScsICdBVCcsICdDSCcsICdERScpXG5hbGlhcygnZnInLCAnQ0gnLCAnRlInKVxuXG5tb2R1bGUuZXhwb3J0cyA9IGRhdGFcbiIsImV4cG9ydCB7IGVkdGYgYXMgZGVmYXVsdCB9IGZyb20gJy4vc3JjL2VkdGYuanMnXG5leHBvcnQgKiBmcm9tICcuL3NyYy90eXBlcy5qcydcbmV4cG9ydCB7IEJpdG1hc2sgfSBmcm9tICcuL3NyYy9iaXRtYXNrLmpzJ1xuZXhwb3J0IHsgcGFyc2UsIGRlZmF1bHRzIH0gZnJvbSAnLi9zcmMvcGFyc2VyLmpzJ1xuZXhwb3J0IHsgZm9ybWF0IH0gZnJvbSAnLi9zcmMvZm9ybWF0LmpzJ1xuIiwiZXhwb3J0IGZ1bmN0aW9uIGFzc2VydCh2YWx1ZSwgbWVzc2FnZSkge1xuICByZXR1cm4gZXF1YWwoISF2YWx1ZSwgdHJ1ZSwgbWVzc2FnZSB8fFxuICAgIGBleHBlY3RlZCBcIiR7dmFsdWV9XCIgdG8gYmUgb2tgKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZXF1YWwoYWN0dWFsLCBleHBlY3RlZCwgbWVzc2FnZSkge1xuICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgZXFlcWVxXG4gIGlmIChhY3R1YWwgPT0gZXhwZWN0ZWQpXG4gICAgcmV0dXJuIHRydWVcblxuICBpZiAoTnVtYmVyLmlzTmFOKGFjdHVhbCkgJiYgTnVtYmVyLmlzTmFOKGV4cGVjdGVkKSlcbiAgICByZXR1cm4gdHJ1ZVxuXG4gIHRocm93IG5ldyBFcnJvcihtZXNzYWdlIHx8XG4gICAgYGV4cGVjdGVkIFwiJHthY3R1YWx9XCIgdG8gZXF1YWwgXCIke2V4cGVjdGVkfVwiYClcbn1cblxuYXNzZXJ0LmVxdWFsID0gZXF1YWxcblxuZXhwb3J0IGRlZmF1bHQgYXNzZXJ0XG4iLCJjb25zdCBEQVkgPSAvXmRheXM/JC9pXG5jb25zdCBNT05USCA9IC9ebW9udGhzPyQvaVxuY29uc3QgWUVBUiA9IC9eeWVhcnM/JC9pXG5jb25zdCBTWU1CT0wgPSAvXlt4WF0kL1xuY29uc3QgU1lNQk9MUyA9IC9beFhdL2dcbmNvbnN0IFBBVFRFUk4gPSAvXlswLTl4WGREbU15WV17OH0kL1xuY29uc3QgWVlZWU1NREQgPSAnWVlZWU1NREQnLnNwbGl0KCcnKVxuY29uc3QgTUFYREFZUyA9IFszMSwgMjksIDMxLCAzMCwgMzEsIDMwLCAzMSwgMzEsIDMwLCAzMSwgMzAsIDMxXVxuXG5jb25zdCB7IGZsb29yLCBwb3csIG1heCwgbWluIH0gPSBNYXRoXG5cblxuLyoqXG4gKiBCaXRtYXNrcyBhcmUgdXNlZCB0byBzZXQgVW5zcGVjaWZpZWQsIFVuY2VydGFpbiBhbmRcbiAqIEFwcHJveGltYXRlIGZsYWdzIGZvciBhIERhdGUuIFRoZSBiaXRtYXNrIGZvciBvbmVcbiAqIGZlYXR1cmUgY29ycmVzcG9uZHMgdG8gYSBudW1lcmljIHZhbHVlIGJhc2VkIG9uIHRoZVxuICogZm9sbG93aW5nIHBhdHRlcm46XG4gKlxuICogICAgICAgICAgIFlZWVlNTUREXG4gKiAgICAgICAgICAgLS0tLS0tLS1cbiAqICAgRGF5ICAgICAwMDAwMDAxMVxuICogICBNb250aCAgIDAwMDAxMTAwXG4gKiAgIFllYXIgICAgMTExMTAwMDBcbiAqXG4gKi9cbmV4cG9ydCBjbGFzcyBCaXRtYXNrIHtcblxuICBzdGF0aWMgdGVzdChhLCBiKSB7XG4gICAgcmV0dXJuIHRoaXMuY29udmVydChhKSAmIHRoaXMuY29udmVydChiKVxuICB9XG5cbiAgc3RhdGljIGNvbnZlcnQodmFsdWUgPSAwKSB7IC8vIGVzbGludC1kaXNhYmxlLWxpbmUgY29tcGxleGl0eVxuICAgIHZhbHVlID0gdmFsdWUgfHwgMFxuXG4gICAgaWYgKHZhbHVlIGluc3RhbmNlb2YgQml0bWFzaykgcmV0dXJuIHZhbHVlLnZhbHVlXG5cbiAgICBzd2l0Y2ggKHR5cGVvZiB2YWx1ZSkge1xuICAgIGNhc2UgJ251bWJlcic6IHJldHVybiB2YWx1ZVxuXG4gICAgY2FzZSAnYm9vbGVhbic6IHJldHVybiB2YWx1ZSA/IEJpdG1hc2suWU1EIDogMFxuXG4gICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgIGlmIChEQVkudGVzdCh2YWx1ZSkpIHJldHVybiBCaXRtYXNrLkRBWVxuICAgICAgaWYgKE1PTlRILnRlc3QodmFsdWUpKSByZXR1cm4gQml0bWFzay5NT05USFxuICAgICAgaWYgKFlFQVIudGVzdCh2YWx1ZSkpIHJldHVybiBCaXRtYXNrLllFQVJcbiAgICAgIGlmIChQQVRURVJOLnRlc3QodmFsdWUpKSByZXR1cm4gQml0bWFzay5jb21wdXRlKHZhbHVlKVxuICAgICAgLy8gZmFsbCB0aHJvdWdoIVxuXG4gICAgZGVmYXVsdDpcbiAgICAgIHRocm93IG5ldyBFcnJvcihgaW52YWxpZCB2YWx1ZTogJHt2YWx1ZX1gKVxuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyBjb21wdXRlKHZhbHVlKSB7XG4gICAgcmV0dXJuIHZhbHVlLnNwbGl0KCcnKS5yZWR1Y2UoKG1lbW8sIGMsIGlkeCkgPT5cbiAgICAgIChtZW1vIHwgKFNZTUJPTC50ZXN0KGMpID8gcG93KDIsIGlkeCkgOiAwKSksIDApXG4gIH1cblxuICBzdGF0aWMgdmFsdWVzKG1hc2ssIGRpZ2l0ID0gMCkge1xuICAgIGxldCBudW0gPSBCaXRtYXNrLm51bWJlcnMobWFzaywgZGlnaXQpLnNwbGl0KCcnKVxuICAgIGxldCB2YWx1ZXMgPSBbTnVtYmVyKG51bS5zbGljZSgwLCA0KS5qb2luKCcnKSldXG5cbiAgICBpZiAobnVtLmxlbmd0aCA+IDQpIHZhbHVlcy5wdXNoKE51bWJlcihudW0uc2xpY2UoNCwgNikuam9pbignJykpKVxuICAgIGlmIChudW0ubGVuZ3RoID4gNikgdmFsdWVzLnB1c2goTnVtYmVyKG51bS5zbGljZSg2LCA4KS5qb2luKCcnKSkpXG5cbiAgICByZXR1cm4gQml0bWFzay5ub3JtYWxpemUodmFsdWVzKVxuICB9XG5cbiAgc3RhdGljIG51bWJlcnMobWFzaywgZGlnaXQgPSAwKSB7XG4gICAgcmV0dXJuIG1hc2sucmVwbGFjZShTWU1CT0xTLCBkaWdpdClcbiAgfVxuXG4gIHN0YXRpYyBub3JtYWxpemUodmFsdWVzKSB7XG4gICAgaWYgKHZhbHVlcy5sZW5ndGggPiAxKVxuICAgICAgdmFsdWVzWzFdID0gbWluKDExLCBtYXgoMCwgdmFsdWVzWzFdIC0gMSkpXG5cbiAgICBpZiAodmFsdWVzLmxlbmd0aCA+IDIpXG4gICAgICB2YWx1ZXNbMl0gPSBtaW4oTUFYREFZU1t2YWx1ZXNbMV1dIHx8IE5hTiwgbWF4KDEsIHZhbHVlc1syXSkpXG5cbiAgICByZXR1cm4gdmFsdWVzXG4gIH1cblxuXG4gIGNvbnN0cnVjdG9yKHZhbHVlID0gMCkge1xuICAgIHRoaXMudmFsdWUgPSBCaXRtYXNrLmNvbnZlcnQodmFsdWUpXG4gIH1cblxuICB0ZXN0KHZhbHVlID0gMCkge1xuICAgIHJldHVybiB0aGlzLnZhbHVlICYgQml0bWFzay5jb252ZXJ0KHZhbHVlKVxuICB9XG5cbiAgYml0KGspIHtcbiAgICByZXR1cm4gdGhpcy52YWx1ZSAmIHBvdygyLCBrKVxuICB9XG5cbiAgZ2V0IGRheSgpIHsgcmV0dXJuIHRoaXMudGVzdChCaXRtYXNrLkRBWSkgfVxuXG4gIGdldCBtb250aCgpIHsgcmV0dXJuIHRoaXMudGVzdChCaXRtYXNrLk1PTlRIKSB9XG5cbiAgZ2V0IHllYXIoKSB7IHJldHVybiB0aGlzLnRlc3QoQml0bWFzay5ZRUFSKSB9XG5cblxuICBhZGQodmFsdWUpIHtcbiAgICByZXR1cm4gKHRoaXMudmFsdWUgPSB0aGlzLnZhbHVlIHwgQml0bWFzay5jb252ZXJ0KHZhbHVlKSksIHRoaXNcbiAgfVxuXG4gIHNldCh2YWx1ZSA9IDApIHtcbiAgICByZXR1cm4gKHRoaXMudmFsdWUgPSBCaXRtYXNrLmNvbnZlcnQodmFsdWUpKSwgdGhpc1xuICB9XG5cbiAgbWFzayhpbnB1dCA9IFlZWVlNTURELCBvZmZzZXQgPSAwLCBzeW1ib2wgPSAnWCcpIHtcbiAgICByZXR1cm4gaW5wdXQubWFwKChjLCBpZHgpID0+IHRoaXMuYml0KG9mZnNldCArIGlkeCkgPyBzeW1ib2wgOiBjKVxuICB9XG5cbiAgbWFza3ModmFsdWVzLCBzeW1ib2wgPSAnWCcpIHtcbiAgICBsZXQgb2Zmc2V0ID0gMFxuXG4gICAgcmV0dXJuIHZhbHVlcy5tYXAodmFsdWUgPT4ge1xuICAgICAgbGV0IG1hc2sgPSB0aGlzLm1hc2sodmFsdWUuc3BsaXQoJycpLCBvZmZzZXQsIHN5bWJvbClcbiAgICAgIG9mZnNldCA9IG9mZnNldCArIG1hc2subGVuZ3RoXG5cbiAgICAgIHJldHVybiBtYXNrLmpvaW4oJycpXG4gICAgfSlcbiAgfVxuXG4gIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBjb21wbGV4aXR5XG4gIG1heChbeWVhciwgbW9udGgsIGRheV0pIHtcbiAgICBpZiAoIXllYXIpIHJldHVybiBbXVxuXG4gICAgeWVhciA9IE51bWJlcihcbiAgICAgICh0aGlzLnRlc3QoQml0bWFzay5ZRUFSKSkgPyB0aGlzLm1hc2tzKFt5ZWFyXSwgJzknKVswXSA6IHllYXJcbiAgICApXG5cbiAgICBpZiAoIW1vbnRoKSByZXR1cm4gW3llYXJdXG5cbiAgICBtb250aCA9IE51bWJlcihtb250aCkgLSAxXG5cbiAgICBzd2l0Y2ggKHRoaXMudGVzdChCaXRtYXNrLk1PTlRIKSkge1xuICAgIGNhc2UgQml0bWFzay5NT05USDpcbiAgICAgIG1vbnRoID0gMTFcbiAgICAgIGJyZWFrXG4gICAgY2FzZSBCaXRtYXNrLk1YOlxuICAgICAgbW9udGggPSAobW9udGggPCA5KSA/IDggOiAxMVxuICAgICAgYnJlYWtcbiAgICBjYXNlIEJpdG1hc2suWE06XG4gICAgICBtb250aCA9IChtb250aCArIDEpICUgMTBcbiAgICAgIG1vbnRoID0gKG1vbnRoIDwgMykgPyBtb250aCArIDkgOiBtb250aCAtIDFcbiAgICAgIGJyZWFrXG4gICAgfVxuXG4gICAgaWYgKCFkYXkpIHJldHVybiBbeWVhciwgbW9udGhdXG5cbiAgICBkYXkgPSBOdW1iZXIoZGF5KVxuXG4gICAgc3dpdGNoICh0aGlzLnRlc3QoQml0bWFzay5EQVkpKSB7XG4gICAgY2FzZSBCaXRtYXNrLkRBWTpcbiAgICAgIGRheSA9IE1BWERBWVNbbW9udGhdXG4gICAgICBicmVha1xuICAgIGNhc2UgQml0bWFzay5EWDpcbiAgICAgIGRheSA9IG1pbihNQVhEQVlTW21vbnRoXSwgZGF5ICsgKDkgLSAoZGF5ICUgMTApKSlcbiAgICAgIGJyZWFrXG4gICAgY2FzZSBCaXRtYXNrLlhEOlxuICAgICAgZGF5ID0gZGF5ICUgMTBcblxuICAgICAgaWYgKG1vbnRoID09PSAxKSB7XG4gICAgICAgIGRheSA9IChkYXkgPT09IDkgJiYgIWxlYXAoeWVhcikpID8gZGF5ICsgMTAgOiBkYXkgKyAyMFxuXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBkYXkgPSAoZGF5IDwgMikgPyBkYXkgKyAzMCA6IGRheSArIDIwXG4gICAgICAgIGlmIChkYXkgPiBNQVhEQVlTW21vbnRoXSkgZGF5ID0gZGF5IC0gMTBcbiAgICAgIH1cblxuICAgICAgYnJlYWtcbiAgICB9XG5cbiAgICBpZiAobW9udGggPT09IDEgJiYgZGF5ID4gMjggJiYgIWxlYXAoeWVhcikpIHtcbiAgICAgIGRheSA9IDI4XG4gICAgfVxuXG4gICAgcmV0dXJuIFt5ZWFyLCBtb250aCwgZGF5XVxuICB9XG5cbiAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGNvbXBsZXhpdHlcbiAgbWluKFt5ZWFyLCBtb250aCwgZGF5XSkge1xuICAgIGlmICgheWVhcikgcmV0dXJuIFtdXG5cbiAgICB5ZWFyID0gTnVtYmVyKFxuICAgICAgKHRoaXMudGVzdChCaXRtYXNrLllFQVIpKSA/IHRoaXMubWFza3MoW3llYXJdLCAnMCcpWzBdIDogeWVhclxuICAgIClcblxuICAgIGlmIChtb250aCA9PSBudWxsKSByZXR1cm4gW3llYXJdXG5cbiAgICBtb250aCA9IE51bWJlcihtb250aCkgLSAxXG5cbiAgICBzd2l0Y2ggKHRoaXMudGVzdChCaXRtYXNrLk1PTlRIKSkge1xuICAgIGNhc2UgQml0bWFzay5NT05USDpcbiAgICBjYXNlIEJpdG1hc2suWE06XG4gICAgICBtb250aCA9IDBcbiAgICAgIGJyZWFrXG4gICAgY2FzZSBCaXRtYXNrLk1YOlxuICAgICAgbW9udGggPSAobW9udGggPCA5KSA/IDAgOiA5XG4gICAgICBicmVha1xuICAgIH1cblxuICAgIGlmICghZGF5KSByZXR1cm4gW3llYXIsIG1vbnRoXVxuXG4gICAgZGF5ID0gTnVtYmVyKGRheSlcblxuICAgIHN3aXRjaCAodGhpcy50ZXN0KEJpdG1hc2suREFZKSkge1xuICAgIGNhc2UgQml0bWFzay5EQVk6XG4gICAgICBkYXkgPSAxXG4gICAgICBicmVha1xuICAgIGNhc2UgQml0bWFzay5EWDpcbiAgICAgIGRheSA9IG1heCgxLCBmbG9vcihkYXkgLyAxMCkgKiAxMClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSBCaXRtYXNrLlhEOlxuICAgICAgZGF5ID0gbWF4KDEsIGRheSAlIDEwKVxuICAgICAgYnJlYWtcbiAgICB9XG5cbiAgICByZXR1cm4gW3llYXIsIG1vbnRoLCBkYXldXG4gIH1cblxuICBtYXJrcyh2YWx1ZXMsIHN5bWJvbCA9ICc/Jykge1xuICAgIHJldHVybiB2YWx1ZXNcbiAgICAgIC5tYXAoKHZhbHVlLCBpZHgpID0+IFtcbiAgICAgICAgdGhpcy5xdWFsaWZpZWQoaWR4ICogMikgPyBzeW1ib2wgOiAnJyxcbiAgICAgICAgdmFsdWUsXG4gICAgICAgIHRoaXMucXVhbGlmaWVkKGlkeCAqIDIgKyAxKSA/IHN5bWJvbCA6ICcnXG4gICAgICBdLmpvaW4oJycpKVxuICB9XG5cbiAgcXVhbGlmaWVkKGlkeCkgeyAvLyBlc2xpbnQtZGlzYWJsZS1saW5lIGNvbXBsZXhpdHlcbiAgICBzd2l0Y2ggKGlkeCkge1xuICAgIGNhc2UgMTpcbiAgICAgIHJldHVybiB0aGlzLnZhbHVlID09PSBCaXRtYXNrLllFQVIgfHxcbiAgICAgICAgKHRoaXMudmFsdWUgJiBCaXRtYXNrLllFQVIpICYmICEodGhpcy52YWx1ZSAmIEJpdG1hc2suTU9OVEgpXG4gICAgY2FzZSAyOlxuICAgICAgcmV0dXJuIHRoaXMudmFsdWUgPT09IEJpdG1hc2suTU9OVEggfHxcbiAgICAgICAgKHRoaXMudmFsdWUgJiBCaXRtYXNrLk1PTlRIKSAmJiAhKHRoaXMudmFsdWUgJiBCaXRtYXNrLllFQVIpXG4gICAgY2FzZSAzOlxuICAgICAgcmV0dXJuIHRoaXMudmFsdWUgPT09IEJpdG1hc2suWU1cbiAgICBjYXNlIDQ6XG4gICAgICByZXR1cm4gdGhpcy52YWx1ZSA9PT0gQml0bWFzay5EQVkgfHxcbiAgICAgICAgKHRoaXMudmFsdWUgJiBCaXRtYXNrLkRBWSkgJiYgKHRoaXMudmFsdWUgIT09IEJpdG1hc2suWU1EKVxuICAgIGNhc2UgNTpcbiAgICAgIHJldHVybiB0aGlzLnZhbHVlID09PSBCaXRtYXNrLllNRFxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gZmFsc2VcbiAgICB9XG4gIH1cblxuICBxdWFsaWZ5KGlkeCkge1xuICAgIHJldHVybiAodGhpcy52YWx1ZSA9IHRoaXMudmFsdWUgfCBCaXRtYXNrLlVBW2lkeF0pLCB0aGlzXG4gIH1cblxuICB0b0pTT04oKSB7XG4gICAgcmV0dXJuIHRoaXMudmFsdWVcbiAgfVxuXG4gIHRvU3RyaW5nKHN5bWJvbCA9ICdYJykge1xuICAgIHJldHVybiB0aGlzLm1hc2tzKFsnWVlZWScsICdNTScsICdERCddLCBzeW1ib2wpLmpvaW4oJy0nKVxuICB9XG59XG5cbkJpdG1hc2sucHJvdG90eXBlLmlzID0gQml0bWFzay5wcm90b3R5cGUudGVzdFxuXG5mdW5jdGlvbiBsZWFwKHllYXIpIHtcbiAgaWYgKHllYXIgJSA0ID4gMCkgcmV0dXJuIGZhbHNlXG4gIGlmICh5ZWFyICUgMTAwID4gMCkgcmV0dXJuIHRydWVcbiAgaWYgKHllYXIgJSA0MDAgPiAwKSByZXR1cm4gZmFsc2VcbiAgcmV0dXJuIHRydWVcbn1cblxuQml0bWFzay5EQVkgICA9IEJpdG1hc2suRCA9IEJpdG1hc2suY29tcHV0ZSgneXl5eW1teHgnKVxuQml0bWFzay5NT05USCA9IEJpdG1hc2suTSA9IEJpdG1hc2suY29tcHV0ZSgneXl5eXh4ZGQnKVxuQml0bWFzay5ZRUFSICA9IEJpdG1hc2suWSA9IEJpdG1hc2suY29tcHV0ZSgneHh4eG1tZGQnKVxuXG5CaXRtYXNrLk1EICA9IEJpdG1hc2suTSB8IEJpdG1hc2suRFxuQml0bWFzay5ZTUQgPSBCaXRtYXNrLlkgfCBCaXRtYXNrLk1EXG5CaXRtYXNrLllNICA9IEJpdG1hc2suWSB8IEJpdG1hc2suTVxuXG5CaXRtYXNrLllZWFggPSBCaXRtYXNrLmNvbXB1dGUoJ3l5eHhtbWRkJylcbkJpdG1hc2suWVlZWCA9IEJpdG1hc2suY29tcHV0ZSgneXl5eG1tZGQnKVxuQml0bWFzay5YWFhYID0gQml0bWFzay5jb21wdXRlKCd4eHh4bW1kZCcpXG5cbkJpdG1hc2suRFggPSBCaXRtYXNrLmNvbXB1dGUoJ3l5eXltbWR4JylcbkJpdG1hc2suWEQgPSBCaXRtYXNrLmNvbXB1dGUoJ3l5eXltbXhkJylcbkJpdG1hc2suTVggPSBCaXRtYXNrLmNvbXB1dGUoJ3l5eXlteGRkJylcbkJpdG1hc2suWE0gPSBCaXRtYXNrLmNvbXB1dGUoJ3l5eXl4bWRkJylcblxuLypcbiAqIE1hcCBlYWNoIFVBIHN5bWJvbCBwb3NpdGlvbiB0byBhIG1hc2suXG4gKlxuICogICB+WVlZWX4tfk1Nfi1+RER+XG4gKiAgIDAgICAgMSAyICAzIDQgIDVcbiAqL1xuQml0bWFzay5VQSA9IFtcbiAgQml0bWFzay5ZRUFSLFxuICBCaXRtYXNrLllFQVIsICAgLy8gWUVBUiAhREFZXG4gIEJpdG1hc2suTU9OVEgsXG4gIEJpdG1hc2suWU0sXG4gIEJpdG1hc2suREFZLCAgICAvLyBZRUFSREFZXG4gIEJpdG1hc2suWU1EXG5dXG4iLCJpbXBvcnQgYXNzZXJ0IGZyb20gJy4vYXNzZXJ0LmpzJ1xuaW1wb3J0IHsgRGF0ZSBhcyBFeHREYXRlIH0gZnJvbSAnLi9kYXRlLmpzJ1xuaW1wb3J0IHsgRXh0RGF0ZVRpbWUgfSBmcm9tICcuL2ludGVyZmFjZS5qcydcblxuY29uc3QgeyBhYnMsIGZsb29yIH0gPSBNYXRoXG5jb25zdCBWID0gbmV3IFdlYWtNYXAoKVxuXG5leHBvcnQgY2xhc3MgQ2VudHVyeSBleHRlbmRzIEV4dERhdGVUaW1lIHtcbiAgY29uc3RydWN0b3IoaW5wdXQpIHtcbiAgICBzdXBlcigpXG5cbiAgICBWLnNldCh0aGlzLCBbXSlcblxuICAgIHRoaXMudW5jZXJ0YWluID0gZmFsc2VcbiAgICB0aGlzLmFwcHJveGltYXRlID0gZmFsc2VcblxuICAgIHN3aXRjaCAodHlwZW9mIGlucHV0KSB7XG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgIHRoaXMuY2VudHVyeSA9IGlucHV0XG4gICAgICBicmVha1xuXG4gICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgIGlucHV0ID0gQ2VudHVyeS5wYXJzZShpbnB1dClcblxuICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1mYWxsdGhyb3VnaFxuICAgIGNhc2UgJ29iamVjdCc6XG4gICAgICBpZiAoQXJyYXkuaXNBcnJheShpbnB1dCkpXG4gICAgICAgIGlucHV0ID0geyB2YWx1ZXM6IGlucHV0IH1cblxuICAgICAge1xuICAgICAgICBhc3NlcnQoaW5wdXQgIT09IG51bGwpXG4gICAgICAgIGlmIChpbnB1dC50eXBlKSBhc3NlcnQuZXF1YWwoJ0NlbnR1cnknLCBpbnB1dC50eXBlKVxuXG4gICAgICAgIGFzc2VydChpbnB1dC52YWx1ZXMpXG4gICAgICAgIGFzc2VydChpbnB1dC52YWx1ZXMubGVuZ3RoID09PSAxKVxuXG4gICAgICAgIHRoaXMuY2VudHVyeSA9IGlucHV0LnZhbHVlc1swXVxuICAgICAgICB0aGlzLnVuY2VydGFpbiA9ICEhaW5wdXQudW5jZXJ0YWluXG4gICAgICAgIHRoaXMuYXBwcm94aW1hdGUgPSAhIWlucHV0LmFwcHJveGltYXRlXG4gICAgICB9XG4gICAgICBicmVha1xuXG4gICAgY2FzZSAndW5kZWZpbmVkJzpcbiAgICAgIHRoaXMueWVhciA9IG5ldyBEYXRlKCkuZ2V0VVRDRnVsbFllYXIoKVxuICAgICAgYnJlYWtcblxuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcignSW52YWxpZCBjZW50dXJ5IHZhbHVlJylcbiAgICB9XG4gIH1cblxuICBnZXQgY2VudHVyeSgpIHtcbiAgICByZXR1cm4gdGhpcy52YWx1ZXNbMF1cbiAgfVxuXG4gIHNldCBjZW50dXJ5KGNlbnR1cnkpIHtcbiAgICBjZW50dXJ5ID0gZmxvb3IoTnVtYmVyKGNlbnR1cnkpKVxuICAgIGFzc2VydChhYnMoY2VudHVyeSkgPCAxMDAsIGBpbnZhbGlkIGNlbnR1cnk6ICR7Y2VudHVyeX1gKVxuICAgIHRoaXMudmFsdWVzWzBdID0gY2VudHVyeVxuICB9XG5cbiAgZ2V0IHllYXIoKSB7XG4gICAgcmV0dXJuIHRoaXMudmFsdWVzWzBdICogMTAwXG4gIH1cblxuICBzZXQgeWVhcih5ZWFyKSB7XG4gICAgdGhpcy5jZW50dXJ5ID0geWVhciAvIDEwMFxuICB9XG5cbiAgZ2V0IHZhbHVlcygpIHtcbiAgICByZXR1cm4gVi5nZXQodGhpcylcbiAgfVxuXG4gIGdldCBtaW4oKSB7XG4gICAgcmV0dXJuIEV4dERhdGUuVVRDKHRoaXMueWVhciwgMClcbiAgfVxuXG4gIGdldCBtYXgoKSB7XG4gICAgcmV0dXJuIEV4dERhdGUuVVRDKHRoaXMueWVhciArIDEwMCwgMCkgLSAxXG4gIH1cblxuICB0b0VEVEYoKSB7XG4gICAgbGV0IGNlbnR1cnkgPSBDZW50dXJ5LnBhZCh0aGlzLmNlbnR1cnkpXG5cbiAgICBpZiAodGhpcy51bmNlcnRhaW4pXG4gICAgICBjZW50dXJ5ID0gY2VudHVyeSArICc/J1xuXG4gICAgaWYgKHRoaXMuYXBwcm94aW1hdGUpXG4gICAgICBjZW50dXJ5ID0gKGNlbnR1cnkgKyAnficpLnJlcGxhY2UoL1xcP34vLCAnJScpXG5cbiAgICByZXR1cm4gY2VudHVyeVxuICB9XG5cbiAgc3RhdGljIHBhZChudW1iZXIpIHtcbiAgICBsZXQgayA9IGFicyhudW1iZXIpXG4gICAgbGV0IHNpZ24gPSAoayA9PT0gbnVtYmVyKSA/ICcnIDogJy0nXG5cbiAgICBpZiAoayA8IDEwKSAgIHJldHVybiBgJHtzaWdufTAke2t9YFxuXG4gICAgcmV0dXJuIGAke251bWJlcn1gXG4gIH1cbn1cbiIsImltcG9ydCBhc3NlcnQgZnJvbSAnLi9hc3NlcnQuanMnXG5pbXBvcnQgeyBCaXRtYXNrIH0gZnJvbSAnLi9iaXRtYXNrLmpzJ1xuaW1wb3J0IHsgRXh0RGF0ZVRpbWUgfSBmcm9tICcuL2ludGVyZmFjZS5qcydcbmltcG9ydCB7IG1peGluIH0gZnJvbSAnLi9taXhpbi5qcydcbmltcG9ydCB7IGZvcm1hdCB9IGZyb20gJy4vZm9ybWF0LmpzJ1xuXG5jb25zdCB7IGFicyB9ID0gTWF0aFxuY29uc3QgeyBpc0FycmF5IH0gPSBBcnJheVxuXG5jb25zdCBQID0gbmV3IFdlYWtNYXAoKVxuY29uc3QgVSA9IG5ldyBXZWFrTWFwKClcbmNvbnN0IEEgPSBuZXcgV2Vha01hcCgpXG5jb25zdCBYID0gbmV3IFdlYWtNYXAoKVxuXG5jb25zdCBQTSA9IFtCaXRtYXNrLllNRCwgQml0bWFzay5ZLCBCaXRtYXNrLllNLCBCaXRtYXNrLllNRF1cblxuZXhwb3J0IGNsYXNzIERhdGUgZXh0ZW5kcyBnbG9iYWxUaGlzLkRhdGUge1xuICBjb25zdHJ1Y3RvciguLi5hcmdzKSB7IC8vIGVzbGludC1kaXNhYmxlLWxpbmUgY29tcGxleGl0eVxuICAgIGxldCBwcmVjaXNpb24gPSAwXG4gICAgbGV0IHVuY2VydGFpbiwgYXBwcm94aW1hdGUsIHVuc3BlY2lmaWVkXG5cbiAgICBzd2l0Y2ggKGFyZ3MubGVuZ3RoKSB7XG4gICAgY2FzZSAwOlxuICAgICAgYnJlYWtcblxuICAgIGNhc2UgMTpcbiAgICAgIHN3aXRjaCAodHlwZW9mIGFyZ3NbMF0pIHtcbiAgICAgIGNhc2UgJ251bWJlcic6XG4gICAgICAgIGJyZWFrXG5cbiAgICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgICAgIGFyZ3MgPSBbRGF0ZS5wYXJzZShhcmdzWzBdKV1cblxuICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWZhbGx0aHJvdWdoXG4gICAgICBjYXNlICdvYmplY3QnOlxuICAgICAgICBpZiAoaXNBcnJheShhcmdzWzBdKSlcbiAgICAgICAgICBhcmdzWzBdID0geyB2YWx1ZXM6IGFyZ3NbMF0gfVxuXG4gICAgICAgIHtcbiAgICAgICAgICBsZXQgb2JqID0gYXJnc1swXVxuXG4gICAgICAgICAgYXNzZXJ0KG9iaiAhPSBudWxsKVxuICAgICAgICAgIGlmIChvYmoudHlwZSkgYXNzZXJ0LmVxdWFsKCdEYXRlJywgb2JqLnR5cGUpXG5cbiAgICAgICAgICBpZiAob2JqLnZhbHVlcyAmJiBvYmoudmFsdWVzLmxlbmd0aCkge1xuICAgICAgICAgICAgcHJlY2lzaW9uID0gb2JqLnZhbHVlcy5sZW5ndGhcbiAgICAgICAgICAgIGFyZ3MgPSBvYmoudmFsdWVzLnNsaWNlKClcblxuICAgICAgICAgICAgLy8gRUNNQSBEYXRlIGNvbnN0cnVjdG9yIG5lZWRzIGF0IGxlYXN0IHR3byBkYXRlIHBhcnRzIVxuICAgICAgICAgICAgaWYgKGFyZ3MubGVuZ3RoIDwgMikgYXJncy5wdXNoKDApXG5cbiAgICAgICAgICAgIGlmIChvYmoub2Zmc2V0KSB7XG4gICAgICAgICAgICAgIGlmIChhcmdzLmxlbmd0aCA8IDMpIGFyZ3MucHVzaCgxKVxuICAgICAgICAgICAgICB3aGlsZSAoYXJncy5sZW5ndGggPCA1KSBhcmdzLnB1c2goMClcblxuICAgICAgICAgICAgICAvLyBFQ01BIERhdGUgY29uc3RydWN0b3IgaGFuZGxlcyBvdmVyZmxvd3Mgc28gd2VcbiAgICAgICAgICAgICAgLy8gc2ltcGx5IGFkZCB0aGUgb2Zmc2V0IVxuICAgICAgICAgICAgICBhcmdzWzRdID0gYXJnc1s0XSArIG9iai5vZmZzZXRcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgYXJncyA9IFtFeHREYXRlVGltZS5VVEMoLi4uYXJncyldXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgKHsgdW5jZXJ0YWluLCBhcHByb3hpbWF0ZSwgdW5zcGVjaWZpZWQgfSA9IG9iailcbiAgICAgICAgfVxuICAgICAgICBicmVha1xuXG4gICAgICBkZWZhdWx0OlxuICAgICAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcignSW52YWxpZCB0aW1lIHZhbHVlJylcbiAgICAgIH1cblxuICAgICAgYnJlYWtcblxuICAgIGRlZmF1bHQ6XG4gICAgICBwcmVjaXNpb24gPSBhcmdzLmxlbmd0aFxuICAgIH1cblxuICAgIHN1cGVyKC4uLmFyZ3MpXG5cbiAgICB0aGlzLnByZWNpc2lvbiA9IHByZWNpc2lvblxuXG4gICAgdGhpcy51bmNlcnRhaW4gPSB1bmNlcnRhaW5cbiAgICB0aGlzLmFwcHJveGltYXRlID0gYXBwcm94aW1hdGVcbiAgICB0aGlzLnVuc3BlY2lmaWVkID0gdW5zcGVjaWZpZWRcbiAgfVxuXG4gIHNldCBwcmVjaXNpb24odmFsdWUpIHtcbiAgICBQLnNldCh0aGlzLCAodmFsdWUgPiAzKSA/IDAgOiBOdW1iZXIodmFsdWUpKVxuICB9XG5cbiAgZ2V0IHByZWNpc2lvbigpIHtcbiAgICByZXR1cm4gUC5nZXQodGhpcylcbiAgfVxuXG4gIHNldCB1bmNlcnRhaW4odmFsdWUpIHtcbiAgICBVLnNldCh0aGlzLCB0aGlzLmJpdHModmFsdWUpKVxuICB9XG5cbiAgZ2V0IHVuY2VydGFpbigpIHtcbiAgICByZXR1cm4gVS5nZXQodGhpcylcbiAgfVxuXG4gIHNldCBhcHByb3hpbWF0ZSh2YWx1ZSkge1xuICAgIEEuc2V0KHRoaXMsIHRoaXMuYml0cyh2YWx1ZSkpXG4gIH1cblxuICBnZXQgYXBwcm94aW1hdGUoKSB7XG4gICAgcmV0dXJuIEEuZ2V0KHRoaXMpXG4gIH1cblxuICBzZXQgdW5zcGVjaWZpZWQodmFsdWUpIHtcbiAgICBYLnNldCh0aGlzLCBuZXcgQml0bWFzayh2YWx1ZSkpXG4gIH1cblxuICBnZXQgdW5zcGVjaWZpZWQoKSB7XG4gICAgcmV0dXJuIFguZ2V0KHRoaXMpXG4gIH1cblxuICBnZXQgYXRvbWljKCkge1xuICAgIHJldHVybiAhKFxuICAgICAgdGhpcy5wcmVjaXNpb24gfHwgdGhpcy51bnNwZWNpZmllZC52YWx1ZVxuICAgIClcbiAgfVxuXG4gIGdldCBtaW4oKSB7XG4gICAgLy8gVE9ETyB1bmNlcnRhaW4gYW5kIGFwcHJveGltYXRlXG5cbiAgICBpZiAodGhpcy51bnNwZWNpZmllZC52YWx1ZSAmJiB0aGlzLnllYXIgPCAwKSB7XG4gICAgICBsZXQgdmFsdWVzID0gdGhpcy51bnNwZWNpZmllZC5tYXgodGhpcy52YWx1ZXMubWFwKERhdGUucGFkKSlcbiAgICAgIHZhbHVlc1swXSA9IC12YWx1ZXNbMF1cbiAgICAgIHJldHVybiAobmV3IERhdGUoeyB2YWx1ZXMgfSkpLmdldFRpbWUoKVxuICAgIH1cblxuICAgIHJldHVybiB0aGlzLmdldFRpbWUoKVxuICB9XG5cbiAgZ2V0IG1heCgpIHtcbiAgICAvLyBUT0RPIHVuY2VydGFpbiBhbmQgYXBwcm94aW1hdGVcbiAgICByZXR1cm4gKHRoaXMuYXRvbWljKSA/IHRoaXMuZ2V0VGltZSgpIDogdGhpcy5uZXh0KCkuZ2V0VGltZSgpIC0gMVxuICB9XG5cbiAgZ2V0IHllYXIoKSB7XG4gICAgcmV0dXJuIHRoaXMuZ2V0VVRDRnVsbFllYXIoKVxuICB9XG5cbiAgZ2V0IG1vbnRoKCkge1xuICAgIHJldHVybiB0aGlzLmdldFVUQ01vbnRoKClcbiAgfVxuXG4gIGdldCBkYXRlKCkge1xuICAgIHJldHVybiB0aGlzLmdldFVUQ0RhdGUoKVxuICB9XG5cbiAgZ2V0IGhvdXJzKCkge1xuICAgIHJldHVybiB0aGlzLmdldFVUQ0hvdXJzKClcbiAgfVxuXG4gIGdldCBtaW51dGVzKCkge1xuICAgIHJldHVybiB0aGlzLmdldFVUQ01pbnV0ZXMoKVxuICB9XG5cbiAgZ2V0IHNlY29uZHMoKSB7XG4gICAgcmV0dXJuIHRoaXMuZ2V0VVRDU2Vjb25kcygpXG4gIH1cblxuICBnZXQgdmFsdWVzKCkge1xuICAgIHN3aXRjaCAodGhpcy5wcmVjaXNpb24pIHtcbiAgICBjYXNlIDE6XG4gICAgICByZXR1cm4gW3RoaXMueWVhcl1cbiAgICBjYXNlIDI6XG4gICAgICByZXR1cm4gW3RoaXMueWVhciwgdGhpcy5tb250aF1cbiAgICBjYXNlIDM6XG4gICAgICByZXR1cm4gW3RoaXMueWVhciwgdGhpcy5tb250aCwgdGhpcy5kYXRlXVxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gW1xuICAgICAgICB0aGlzLnllYXIsIHRoaXMubW9udGgsIHRoaXMuZGF0ZSwgdGhpcy5ob3VycywgdGhpcy5taW51dGVzLCB0aGlzLnNlY29uZHNcbiAgICAgIF1cbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogUmV0dXJucyB0aGUgbmV4dCBzZWNvbmQsIGRheSwgbW9udGgsIG9yIHllYXIsIGRlcGVuZGluZyBvblxuICAgKiB0aGUgY3VycmVudCBkYXRlJ3MgcHJlY2lzaW9uLiBVbmNlcnRhaW4sIGFwcHJveGltYXRlIGFuZFxuICAgKiB1bnNwZWNpZmllZCBtYXNrcyBhcmUgY29waWVkLlxuICAgKi9cbiAgbmV4dChrID0gMSkge1xuICAgIGxldCB7IHZhbHVlcywgdW5zcGVjaWZpZWQsIHVuY2VydGFpbiwgYXBwcm94aW1hdGUgfSA9IHRoaXNcblxuICAgIGlmICh1bnNwZWNpZmllZC52YWx1ZSkge1xuICAgICAgbGV0IGJjID0gdmFsdWVzWzBdIDwgMFxuXG4gICAgICB2YWx1ZXMgPSAoayA8IDApIF4gYmMgP1xuICAgICAgICB1bnNwZWNpZmllZC5taW4odmFsdWVzLm1hcChEYXRlLnBhZCkpIDpcbiAgICAgICAgdW5zcGVjaWZpZWQubWF4KHZhbHVlcy5tYXAoRGF0ZS5wYWQpKVxuXG4gICAgICBpZiAoYmMpIHZhbHVlc1swXSA9IC12YWx1ZXNbMF1cbiAgICB9XG5cbiAgICB2YWx1ZXMucHVzaCh2YWx1ZXMucG9wKCkgKyBrKVxuXG4gICAgcmV0dXJuIG5ldyBEYXRlKHsgdmFsdWVzLCB1bnNwZWNpZmllZCwgdW5jZXJ0YWluLCBhcHByb3hpbWF0ZSB9KVxuICB9XG5cbiAgcHJldihrID0gMSkge1xuICAgIHJldHVybiB0aGlzLm5leHQoLWspXG4gIH1cblxuICAqW1N5bWJvbC5pdGVyYXRvcl0oKSB7XG4gICAgbGV0IGN1ciA9IHRoaXNcblxuICAgIHdoaWxlIChjdXIgPD0gdGhpcy5tYXgpIHtcbiAgICAgIHlpZWxkIGN1clxuICAgICAgY3VyID0gY3VyLm5leHQoKVxuICAgIH1cbiAgfVxuXG4gIHRvRURURigpIHtcbiAgICBpZiAoIXRoaXMucHJlY2lzaW9uKSByZXR1cm4gdGhpcy50b0lTT1N0cmluZygpXG5cbiAgICBsZXQgc2lnbiA9ICh0aGlzLnllYXIgPCAwKSA/ICctJyA6ICcnXG4gICAgbGV0IHZhbHVlcyA9IHRoaXMudmFsdWVzLm1hcChEYXRlLnBhZClcblxuICAgIGlmICh0aGlzLnVuc3BlY2lmaWVkLnZhbHVlKVxuICAgICAgcmV0dXJuIHNpZ24gKyB0aGlzLnVuc3BlY2lmaWVkLm1hc2tzKHZhbHVlcykuam9pbignLScpXG5cbiAgICBpZiAodGhpcy51bmNlcnRhaW4udmFsdWUpXG4gICAgICB2YWx1ZXMgPSB0aGlzLnVuY2VydGFpbi5tYXJrcyh2YWx1ZXMsICc/JylcblxuICAgIGlmICh0aGlzLmFwcHJveGltYXRlLnZhbHVlKSB7XG4gICAgICB2YWx1ZXMgPSB0aGlzLmFwcHJveGltYXRlLm1hcmtzKHZhbHVlcywgJ34nKVxuICAgICAgICAubWFwKHZhbHVlID0+IHZhbHVlLnJlcGxhY2UoLyh+XFw/KXwoXFw/fikvLCAnJScpKVxuICAgIH1cblxuICAgIHJldHVybiAgc2lnbiArIHZhbHVlcy5qb2luKCctJylcbiAgfVxuXG4gIGZvcm1hdCguLi5hcmdzKSB7XG4gICAgcmV0dXJuIGZvcm1hdCh0aGlzLCAuLi5hcmdzKVxuICB9XG5cbiAgc3RhdGljIHBhZChudW1iZXIsIGlkeCA9IDApIHtcbiAgICBpZiAoIWlkeCkgeyAvLyBpZHggMCA9IHllYXIsIDEgPSBtb250aCwgLi4uXG4gICAgICBsZXQgayA9IGFicyhudW1iZXIpXG5cbiAgICAgIGlmIChrIDwgMTApICAgcmV0dXJuIGAwMDAke2t9YFxuICAgICAgaWYgKGsgPCAxMDApICByZXR1cm4gYDAwJHtrfWBcbiAgICAgIGlmIChrIDwgMTAwMCkgcmV0dXJuIGAwJHtrfWBcblxuICAgICAgcmV0dXJuIGAke2t9YFxuICAgIH1cblxuICAgIGlmIChpZHggPT09IDEpIG51bWJlciA9IG51bWJlciArIDFcblxuICAgIHJldHVybiAobnVtYmVyIDwgMTApID8gYDAke251bWJlcn1gIDogYCR7bnVtYmVyfWBcbiAgfVxuXG4gIGJpdHModmFsdWUpIHtcbiAgICBpZiAodmFsdWUgPT09IHRydWUpXG4gICAgICB2YWx1ZSA9IFBNW3RoaXMucHJlY2lzaW9uXVxuXG4gICAgcmV0dXJuIG5ldyBCaXRtYXNrKHZhbHVlKVxuICB9XG59XG5cbm1peGluKERhdGUsIEV4dERhdGVUaW1lKVxuXG5leHBvcnQgY29uc3QgcGFkID0gRGF0ZS5wYWRcbiIsImltcG9ydCBhc3NlcnQgZnJvbSAnLi9hc3NlcnQuanMnXG5pbXBvcnQgeyBEYXRlIGFzIEV4dERhdGUgfSBmcm9tICcuL2RhdGUuanMnXG5pbXBvcnQgeyBFeHREYXRlVGltZSB9IGZyb20gJy4vaW50ZXJmYWNlLmpzJ1xuXG5jb25zdCB7IGFicywgZmxvb3IgfSA9IE1hdGhcbmNvbnN0IFYgPSBuZXcgV2Vha01hcCgpXG5cblxuZXhwb3J0IGNsYXNzIERlY2FkZSBleHRlbmRzIEV4dERhdGVUaW1lIHtcbiAgY29uc3RydWN0b3IoaW5wdXQpIHtcbiAgICBzdXBlcigpXG5cbiAgICBWLnNldCh0aGlzLCBbXSlcblxuICAgIHRoaXMudW5jZXJ0YWluID0gZmFsc2VcbiAgICB0aGlzLmFwcHJveGltYXRlID0gZmFsc2VcblxuICAgIHN3aXRjaCAodHlwZW9mIGlucHV0KSB7XG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgIHRoaXMuZGVjYWRlID0gaW5wdXRcbiAgICAgIGJyZWFrXG5cbiAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgaW5wdXQgPSBEZWNhZGUucGFyc2UoaW5wdXQpXG5cbiAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tZmFsbHRocm91Z2hcbiAgICBjYXNlICdvYmplY3QnOlxuICAgICAgaWYgKEFycmF5LmlzQXJyYXkoaW5wdXQpKVxuICAgICAgICBpbnB1dCA9IHsgdmFsdWVzOiBpbnB1dCB9XG5cbiAgICAgIHtcbiAgICAgICAgYXNzZXJ0KGlucHV0ICE9PSBudWxsKVxuICAgICAgICBpZiAoaW5wdXQudHlwZSkgYXNzZXJ0LmVxdWFsKCdEZWNhZGUnLCBpbnB1dC50eXBlKVxuXG4gICAgICAgIGFzc2VydChpbnB1dC52YWx1ZXMpXG4gICAgICAgIGFzc2VydChpbnB1dC52YWx1ZXMubGVuZ3RoID09PSAxKVxuXG4gICAgICAgIHRoaXMuZGVjYWRlID0gaW5wdXQudmFsdWVzWzBdXG4gICAgICAgIHRoaXMudW5jZXJ0YWluID0gISFpbnB1dC51bmNlcnRhaW5cbiAgICAgICAgdGhpcy5hcHByb3hpbWF0ZSA9ICEhaW5wdXQuYXBwcm94aW1hdGVcbiAgICAgIH1cbiAgICAgIGJyZWFrXG5cbiAgICBjYXNlICd1bmRlZmluZWQnOlxuICAgICAgdGhpcy55ZWFyID0gbmV3IERhdGUoKS5nZXRVVENGdWxsWWVhcigpXG4gICAgICBicmVha1xuXG4gICAgZGVmYXVsdDpcbiAgICAgIHRocm93IG5ldyBSYW5nZUVycm9yKCdJbnZhbGlkIGRlY2FkZSB2YWx1ZScpXG4gICAgfVxuICB9XG5cbiAgZ2V0IGRlY2FkZSgpIHtcbiAgICByZXR1cm4gdGhpcy52YWx1ZXNbMF1cbiAgfVxuXG4gIHNldCBkZWNhZGUoZGVjYWRlKSB7XG4gICAgZGVjYWRlID0gZmxvb3IoTnVtYmVyKGRlY2FkZSkpXG4gICAgYXNzZXJ0KGFicyhkZWNhZGUpIDwgMTAwMCwgYGludmFsaWQgZGVjYWRlOiAke2RlY2FkZX1gKVxuICAgIHRoaXMudmFsdWVzWzBdID0gZGVjYWRlXG4gIH1cblxuICBnZXQgeWVhcigpIHtcbiAgICByZXR1cm4gdGhpcy52YWx1ZXNbMF0gKiAxMFxuICB9XG5cbiAgc2V0IHllYXIoeWVhcikge1xuICAgIHRoaXMuZGVjYWRlID0geWVhciAvIDEwXG4gIH1cblxuICBnZXQgdmFsdWVzKCkge1xuICAgIHJldHVybiBWLmdldCh0aGlzKVxuICB9XG5cbiAgZ2V0IG1pbigpIHtcbiAgICByZXR1cm4gRXh0RGF0ZS5VVEModGhpcy55ZWFyLCAwKVxuICB9XG5cbiAgZ2V0IG1heCgpIHtcbiAgICByZXR1cm4gRXh0RGF0ZS5VVEModGhpcy55ZWFyICsgMTAsIDApIC0gMVxuICB9XG5cbiAgdG9FRFRGKCkge1xuICAgIGxldCBkZWNhZGUgPSBEZWNhZGUucGFkKHRoaXMuZGVjYWRlKVxuXG4gICAgaWYgKHRoaXMudW5jZXJ0YWluKVxuICAgICAgZGVjYWRlID0gZGVjYWRlICsgJz8nXG5cbiAgICBpZiAodGhpcy5hcHByb3hpbWF0ZSlcbiAgICAgIGRlY2FkZSA9IChkZWNhZGUgKyAnficpLnJlcGxhY2UoL1xcP34vLCAnJScpXG5cbiAgICByZXR1cm4gZGVjYWRlXG4gIH1cblxuICBzdGF0aWMgcGFkKG51bWJlcikge1xuICAgIGxldCBrID0gYWJzKG51bWJlcilcbiAgICBsZXQgc2lnbiA9IChrID09PSBudW1iZXIpID8gJycgOiAnLSdcblxuICAgIGlmIChrIDwgMTApICAgcmV0dXJuIGAke3NpZ259MDAke2t9YFxuICAgIGlmIChrIDwgMTAwKSAgcmV0dXJuIGAke3NpZ259MCR7a31gXG5cbiAgICByZXR1cm4gYCR7bnVtYmVyfWBcbiAgfVxufVxuIiwiaW1wb3J0ICogYXMgdHlwZXMgZnJvbSAnLi90eXBlcy5qcydcbmltcG9ydCB7IHBhcnNlIH0gZnJvbSAnLi9wYXJzZXIuanMnXG5cbmNvbnN0IFVOSVhfVElNRSA9IC9eXFxkezUsfSQvXG5cbmV4cG9ydCBmdW5jdGlvbiBlZHRmKC4uLmFyZ3MpIHtcbiAgaWYgKCFhcmdzLmxlbmd0aClcbiAgICByZXR1cm4gbmV3IHR5cGVzLkRhdGUoKVxuXG4gIGlmIChhcmdzLmxlbmd0aCA9PT0gMSkge1xuICAgIHN3aXRjaCAodHlwZW9mIGFyZ3NbMF0pIHtcbiAgICBjYXNlICdvYmplY3QnOlxuICAgICAgcmV0dXJuIG5ldyAodHlwZXNbYXJnc1swXS50eXBlXSB8fCB0eXBlcy5EYXRlKShhcmdzWzBdKVxuICAgIGNhc2UgJ251bWJlcic6XG4gICAgICByZXR1cm4gbmV3IHR5cGVzLkRhdGUoYXJnc1swXSlcbiAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgaWYgKChVTklYX1RJTUUpLnRlc3QoYXJnc1swXSkpXG4gICAgICAgIHJldHVybiBuZXcgdHlwZXMuRGF0ZShOdW1iZXIoYXJnc1swXSkpXG4gICAgfVxuICB9XG5cbiAgbGV0IHJlcyA9IHBhcnNlKC4uLmFyZ3MpXG4gIHJldHVybiBuZXcgdHlwZXNbcmVzLnR5cGVdKHJlcylcbn1cbiIsImltcG9ydCBMQyBmcm9tICcuLi9sb2NhbGUtZGF0YS9pbmRleC5janMnXG5cbmNvbnN0IHsgYXNzaWduIH0gPSBPYmplY3RcblxuY29uc3Qgbm9UaW1lID0ge1xuICB0aW1lWm9uZTogJ1VUQycsXG4gIHRpbWVab25lTmFtZTogdW5kZWZpbmVkLFxuICBob3VyOiB1bmRlZmluZWQsXG4gIG1pbnV0ZTogdW5kZWZpbmVkLFxuICBzZWNvbmQ6IHVuZGVmaW5lZFxufVxuXG5jb25zdCBERUZBVUxUUyA9IFtcbiAge30sXG4gIGFzc2lnbih7IHdlZWtkYXk6IHVuZGVmaW5lZCwgZGF5OiB1bmRlZmluZWQsIG1vbnRoOiB1bmRlZmluZWQgfSwgbm9UaW1lKSxcbiAgYXNzaWduKHsgd2Vla2RheTogdW5kZWZpbmVkLCBkYXk6IHVuZGVmaW5lZCB9LCBub1RpbWUpLFxuICBhc3NpZ24oe30sIG5vVGltZSksXG5dXG5cblxuZnVuY3Rpb24gZ2V0Q2FjaGVJZCguLi5hcmdzKSB7XG4gIGxldCBpZCA9IFtdXG5cbiAgZm9yIChsZXQgYXJnIG9mIGFyZ3MpIHtcbiAgICBpZiAoYXJnICYmIHR5cGVvZiBhcmcgPT09ICdvYmplY3QnKSB7XG4gICAgICBpZC5wdXNoKGdldE9yZGVyZWRQcm9wcyhhcmcpKVxuICAgIH0gZWxzZSB7XG4gICAgICBpZC5wdXNoKGFyZylcbiAgICB9XG4gIH1cblxuICByZXR1cm4gSlNPTi5zdHJpbmdpZnkoaWQpXG5cbn1cblxuZnVuY3Rpb24gZ2V0T3JkZXJlZFByb3BzKG9iaikge1xuICBsZXQgcHJvcHMgPSBbXVxuICBsZXQga2V5cyA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eU5hbWVzKG9iailcblxuICBmb3IgKGxldCBrZXkgb2Yga2V5cy5zb3J0KCkpIHtcbiAgICBwcm9wcy5wdXNoKHsgW2tleV06IG9ialtrZXldIH0pXG4gIH1cblxuICByZXR1cm4gcHJvcHNcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEZvcm1hdChkYXRlLCBsb2NhbGUsIG9wdGlvbnMpIHtcbiAgbGV0IG9wdHMgPSB7fVxuXG4gIHN3aXRjaCAoZGF0ZS5wcmVjaXNpb24pIHtcbiAgY2FzZSAzOlxuICAgIG9wdHMuZGF5ID0gJ251bWVyaWMnXG4gICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWZhbGx0aHJvdWdoXG4gIGNhc2UgMjpcbiAgICBvcHRzLm1vbnRoID0gJ251bWVyaWMnXG4gICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWZhbGx0aHJvdWdoXG4gIGNhc2UgMTpcbiAgICBvcHRzLnllYXIgPSAnbnVtZXJpYydcbiAgICBicmVha1xuICB9XG5cbiAgYXNzaWduKG9wdHMsIG9wdGlvbnMsIERFRkFVTFRTW2RhdGUucHJlY2lzaW9uXSlcblxuICBsZXQgaWQgPSBnZXRDYWNoZUlkKGxvY2FsZSwgb3B0cylcblxuICBpZiAoIWZvcm1hdC5jYWNoZS5oYXMoaWQpKSB7XG4gICAgZm9ybWF0LmNhY2hlLnNldChpZCwgbmV3IEludGwuRGF0ZVRpbWVGb3JtYXQobG9jYWxlLCBvcHRzKSlcbiAgfVxuXG4gIHJldHVybiBmb3JtYXQuY2FjaGUuZ2V0KGlkKVxufVxuXG5mdW5jdGlvbiBnZXRQYXR0ZXJuc0ZvcihmbXQpIHtcbiAgY29uc3QgeyBsb2NhbGUsIHdlZWtkYXksIG1vbnRoLCB5ZWFyIH0gPSBmbXQucmVzb2x2ZWRPcHRpb25zKClcbiAgY29uc3QgbGMgPSBMQ1tsb2NhbGVdXG5cbiAgaWYgKGxjID09IG51bGwpIHJldHVybiBudWxsXG5cbiAgY29uc3QgdmFyaWFudCA9ICh3ZWVrZGF5IHx8IG1vbnRoID09PSAnbG9uZycpID8gJ2xvbmcnIDpcbiAgICAoIW1vbnRoIHx8IHllYXIgPT09ICcyLWRpZ2l0JykgPyAnc2hvcnQnIDogJ21lZGl1bSdcblxuICByZXR1cm4ge1xuICAgIGFwcHJveGltYXRlOiBsYy5kYXRlLmFwcHJveGltYXRlW3ZhcmlhbnRdLFxuICAgIHVuY2VydGFpbjogbGMuZGF0ZS51bmNlcnRhaW5bdmFyaWFudF1cbiAgfVxufVxuXG5mdW5jdGlvbiBpc0RNWSh0eXBlKSB7XG4gIHJldHVybiB0eXBlID09PSAnZGF5JyB8fCB0eXBlID09PSAnbW9udGgnIHx8IHR5cGUgPT09ICd5ZWFyJ1xufVxuXG5mdW5jdGlvbiBtYXNrKGRhdGUsIHBhcnRzKSB7XG4gIGxldCBzdHJpbmcgPSAnJ1xuXG4gIGZvciAobGV0IHsgdHlwZSwgdmFsdWUgfSBvZiBwYXJ0cykge1xuICAgIHN0cmluZyArPSAoaXNETVkodHlwZSkgJiYgZGF0ZS51bnNwZWNpZmllZC5pcyh0eXBlKSkgP1xuICAgICAgdmFsdWUucmVwbGFjZSgvLi9nLCAnWCcpIDpcbiAgICAgIHZhbHVlXG4gIH1cblxuICByZXR1cm4gc3RyaW5nXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmb3JtYXQoZGF0ZSwgbG9jYWxlID0gJ2VuLVVTJywgb3B0aW9ucyA9IHt9KSB7XG4gIGNvbnN0IGZtdCA9IGdldEZvcm1hdChkYXRlLCBsb2NhbGUsIG9wdGlvbnMpXG4gIGNvbnN0IHBhdCA9IGdldFBhdHRlcm5zRm9yKGZtdClcblxuICBpZiAoIWRhdGUuaXNFRFRGIHx8IHBhdCA9PSBudWxsKSB7XG4gICAgcmV0dXJuIGZtdC5mb3JtYXQoZGF0ZSlcbiAgfVxuXG4gIGxldCBzdHJpbmcgPSAoIWRhdGUudW5zcGVjaWZpZWQudmFsdWUgfHwgIWZtdC5mb3JtYXRUb1BhcnRzKSA/XG4gICAgZm10LmZvcm1hdChkYXRlKSA6XG4gICAgbWFzayhkYXRlLCBmbXQuZm9ybWF0VG9QYXJ0cyhkYXRlKSlcblxuXG4gIGlmIChkYXRlLmFwcHJveGltYXRlLnZhbHVlKSB7XG4gICAgc3RyaW5nID0gcGF0LmFwcHJveGltYXRlLnJlcGxhY2UoJyVEJywgc3RyaW5nKVxuICB9XG5cbiAgaWYgKGRhdGUudW5jZXJ0YWluLnZhbHVlKSB7XG4gICAgc3RyaW5nID0gcGF0LnVuY2VydGFpbi5yZXBsYWNlKCclRCcsIHN0cmluZylcbiAgfVxuXG4gIHJldHVybiBzdHJpbmdcbn1cblxuZm9ybWF0LmNhY2hlID0gbmV3IE1hcCgpXG4iLCIvLyBHZW5lcmF0ZWQgYXV0b21hdGljYWxseSBieSBuZWFybGV5LCB2ZXJzaW9uIDIuMjAuMVxuLy8gaHR0cDovL2dpdGh1Yi5jb20vSGFyZG1hdGgxMjMvbmVhcmxleVxuZnVuY3Rpb24gaWQoeCkgeyByZXR1cm4geFswXTsgfVxuXG4gIGltcG9ydCB7XG4gICAgbnVtLCB6ZXJvLCBub3RoaW5nLCBwaWNrLCBwbHVjaywgam9pbiwgY29uY2F0LCBtZXJnZSwgY2VudHVyeSxcbiAgICBpbnRlcnZhbCwgbGlzdCwgbWFza2VkLCBkYXRlLCBkYXRldGltZSwgc2Vhc29uLCBxdWFsaWZ5LCB5ZWFyLCBkZWNhZGVcbiAgfSBmcm9tICcuL3V0aWwuanMnXG5cbiAgaW1wb3J0IHsgQml0bWFzayB9IGZyb20gJy4vYml0bWFzay5qcydcblxuICBjb25zdCB7XG4gICAgREFZLCBNT05USCwgWUVBUiwgWU1ELCBZTSwgTUQsIFlZWFgsIFlZWVgsIFhYWFhcbiAgfSA9IEJpdG1hc2tcbmxldCBMZXhlciA9IHVuZGVmaW5lZDtcbmxldCBQYXJzZXJSdWxlcyA9IFtcbiAgICB7XCJuYW1lXCI6IFwiZWR0ZlwiLCBcInN5bWJvbHNcIjogW1wiTDBcIl0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJlZHRmXCIsIFwic3ltYm9sc1wiOiBbXCJMMVwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH0sXG4gICAge1wibmFtZVwiOiBcImVkdGZcIiwgXCJzeW1ib2xzXCI6IFtcIkwyXCJdLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwiZWR0ZlwiLCBcInN5bWJvbHNcIjogW1wiTDNcIl0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJMMFwiLCBcInN5bWJvbHNcIjogW1wiZGF0ZV90aW1lXCJdLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwiTDBcIiwgXCJzeW1ib2xzXCI6IFtcImNlbnR1cnlcIl0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJMMFwiLCBcInN5bWJvbHNcIjogW1wiTDBpXCJdLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwiTDBpXCIsIFwic3ltYm9sc1wiOiBbXCJkYXRlX3RpbWVcIiwge1wibGl0ZXJhbFwiOlwiL1wifSwgXCJkYXRlX3RpbWVcIl0sIFwicG9zdHByb2Nlc3NcIjogaW50ZXJ2YWwoMCl9LFxuICAgIHtcIm5hbWVcIjogXCJjZW50dXJ5XCIsIFwic3ltYm9sc1wiOiBbXCJwb3NpdGl2ZV9jZW50dXJ5XCJdLCBcInBvc3Rwcm9jZXNzXCI6IGRhdGEgPT4gY2VudHVyeShkYXRhWzBdKX0sXG4gICAge1wibmFtZVwiOiBcImNlbnR1cnkkc3RyaW5nJDFcIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCIwXCJ9LCB7XCJsaXRlcmFsXCI6XCIwXCJ9XSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbiBqb2luZXIoZCkge3JldHVybiBkLmpvaW4oJycpO319LFxuICAgIHtcIm5hbWVcIjogXCJjZW50dXJ5XCIsIFwic3ltYm9sc1wiOiBbXCJjZW50dXJ5JHN0cmluZyQxXCJdLCBcInBvc3Rwcm9jZXNzXCI6IGRhdGEgPT4gY2VudHVyeSgwKX0sXG4gICAge1wibmFtZVwiOiBcImNlbnR1cnlcIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCItXCJ9LCBcInBvc2l0aXZlX2NlbnR1cnlcIl0sIFwicG9zdHByb2Nlc3NcIjogZGF0YSA9PiBjZW50dXJ5KC1kYXRhWzFdKX0sXG4gICAge1wibmFtZVwiOiBcInBvc2l0aXZlX2NlbnR1cnlcIiwgXCJzeW1ib2xzXCI6IFtcInBvc2l0aXZlX2RpZ2l0XCIsIFwiZGlnaXRcIl0sIFwicG9zdHByb2Nlc3NcIjogbnVtfSxcbiAgICB7XCJuYW1lXCI6IFwicG9zaXRpdmVfY2VudHVyeVwiLCBcInN5bWJvbHNcIjogW3tcImxpdGVyYWxcIjpcIjBcIn0sIFwicG9zaXRpdmVfZGlnaXRcIl0sIFwicG9zdHByb2Nlc3NcIjogbnVtfSxcbiAgICB7XCJuYW1lXCI6IFwiZGF0ZV90aW1lXCIsIFwic3ltYm9sc1wiOiBbXCJkYXRlXCJdLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwiZGF0ZV90aW1lXCIsIFwic3ltYm9sc1wiOiBbXCJkYXRldGltZVwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH0sXG4gICAge1wibmFtZVwiOiBcImRhdGVcIiwgXCJzeW1ib2xzXCI6IFtcInllYXJcIl0sIFwicG9zdHByb2Nlc3NcIjogZGF0YSA9PiBkYXRlKGRhdGEpfSxcbiAgICB7XCJuYW1lXCI6IFwiZGF0ZVwiLCBcInN5bWJvbHNcIjogW1wieWVhcl9tb250aFwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBkYXRhID0+IGRhdGUoZGF0YVswXSl9LFxuICAgIHtcIm5hbWVcIjogXCJkYXRlXCIsIFwic3ltYm9sc1wiOiBbXCJ5ZWFyX21vbnRoX2RheVwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBkYXRhID0+IGRhdGUoZGF0YVswXSl9LFxuICAgIHtcIm5hbWVcIjogXCJ5ZWFyXCIsIFwic3ltYm9sc1wiOiBbXCJwb3NpdGl2ZV95ZWFyXCJdLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwieWVhclwiLCBcInN5bWJvbHNcIjogW1wibmVnYXRpdmVfeWVhclwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH0sXG4gICAge1wibmFtZVwiOiBcInllYXIkc3RyaW5nJDFcIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCIwXCJ9LCB7XCJsaXRlcmFsXCI6XCIwXCJ9LCB7XCJsaXRlcmFsXCI6XCIwXCJ9LCB7XCJsaXRlcmFsXCI6XCIwXCJ9XSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbiBqb2luZXIoZCkge3JldHVybiBkLmpvaW4oJycpO319LFxuICAgIHtcIm5hbWVcIjogXCJ5ZWFyXCIsIFwic3ltYm9sc1wiOiBbXCJ5ZWFyJHN0cmluZyQxXCJdLCBcInBvc3Rwcm9jZXNzXCI6IGpvaW59LFxuICAgIHtcIm5hbWVcIjogXCJwb3NpdGl2ZV95ZWFyXCIsIFwic3ltYm9sc1wiOiBbXCJwb3NpdGl2ZV9kaWdpdFwiLCBcImRpZ2l0XCIsIFwiZGlnaXRcIiwgXCJkaWdpdFwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBqb2lufSxcbiAgICB7XCJuYW1lXCI6IFwicG9zaXRpdmVfeWVhclwiLCBcInN5bWJvbHNcIjogW3tcImxpdGVyYWxcIjpcIjBcIn0sIFwicG9zaXRpdmVfZGlnaXRcIiwgXCJkaWdpdFwiLCBcImRpZ2l0XCJdLCBcInBvc3Rwcm9jZXNzXCI6IGpvaW59LFxuICAgIHtcIm5hbWVcIjogXCJwb3NpdGl2ZV95ZWFyJHN0cmluZyQxXCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiMFwifSwge1wibGl0ZXJhbFwiOlwiMFwifV0sIFwicG9zdHByb2Nlc3NcIjogZnVuY3Rpb24gam9pbmVyKGQpIHtyZXR1cm4gZC5qb2luKCcnKTt9fSxcbiAgICB7XCJuYW1lXCI6IFwicG9zaXRpdmVfeWVhclwiLCBcInN5bWJvbHNcIjogW1wicG9zaXRpdmVfeWVhciRzdHJpbmckMVwiLCBcInBvc2l0aXZlX2RpZ2l0XCIsIFwiZGlnaXRcIl0sIFwicG9zdHByb2Nlc3NcIjogam9pbn0sXG4gICAge1wibmFtZVwiOiBcInBvc2l0aXZlX3llYXIkc3RyaW5nJDJcIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCIwXCJ9LCB7XCJsaXRlcmFsXCI6XCIwXCJ9LCB7XCJsaXRlcmFsXCI6XCIwXCJ9XSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbiBqb2luZXIoZCkge3JldHVybiBkLmpvaW4oJycpO319LFxuICAgIHtcIm5hbWVcIjogXCJwb3NpdGl2ZV95ZWFyXCIsIFwic3ltYm9sc1wiOiBbXCJwb3NpdGl2ZV95ZWFyJHN0cmluZyQyXCIsIFwicG9zaXRpdmVfZGlnaXRcIl0sIFwicG9zdHByb2Nlc3NcIjogam9pbn0sXG4gICAge1wibmFtZVwiOiBcIm5lZ2F0aXZlX3llYXJcIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCItXCJ9LCBcInBvc2l0aXZlX3llYXJcIl0sIFwicG9zdHByb2Nlc3NcIjogam9pbn0sXG4gICAge1wibmFtZVwiOiBcInllYXJfbW9udGhcIiwgXCJzeW1ib2xzXCI6IFtcInllYXJcIiwge1wibGl0ZXJhbFwiOlwiLVwifSwgXCJtb250aFwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBwaWNrKDAsIDIpfSxcbiAgICB7XCJuYW1lXCI6IFwieWVhcl9tb250aF9kYXlcIiwgXCJzeW1ib2xzXCI6IFtcInllYXJcIiwge1wibGl0ZXJhbFwiOlwiLVwifSwgXCJtb250aF9kYXlcIl0sIFwicG9zdHByb2Nlc3NcIjogcGljaygwLCAyKX0sXG4gICAge1wibmFtZVwiOiBcIm1vbnRoXCIsIFwic3ltYm9sc1wiOiBbXCJkMDFfMTJcIl0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJtb250aF9kYXlcIiwgXCJzeW1ib2xzXCI6IFtcIm0zMVwiLCB7XCJsaXRlcmFsXCI6XCItXCJ9LCBcImRheVwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBwaWNrKDAsIDIpfSxcbiAgICB7XCJuYW1lXCI6IFwibW9udGhfZGF5XCIsIFwic3ltYm9sc1wiOiBbXCJtMzBcIiwge1wibGl0ZXJhbFwiOlwiLVwifSwgXCJkMDFfMzBcIl0sIFwicG9zdHByb2Nlc3NcIjogcGljaygwLCAyKX0sXG4gICAge1wibmFtZVwiOiBcIm1vbnRoX2RheSRzdHJpbmckMVwiLCBcInN5bWJvbHNcIjogW3tcImxpdGVyYWxcIjpcIjBcIn0sIHtcImxpdGVyYWxcIjpcIjJcIn1dLCBcInBvc3Rwcm9jZXNzXCI6IGZ1bmN0aW9uIGpvaW5lcihkKSB7cmV0dXJuIGQuam9pbignJyk7fX0sXG4gICAge1wibmFtZVwiOiBcIm1vbnRoX2RheVwiLCBcInN5bWJvbHNcIjogW1wibW9udGhfZGF5JHN0cmluZyQxXCIsIHtcImxpdGVyYWxcIjpcIi1cIn0sIFwiZDAxXzI5XCJdLCBcInBvc3Rwcm9jZXNzXCI6IHBpY2soMCwgMil9LFxuICAgIHtcIm5hbWVcIjogXCJkYXlcIiwgXCJzeW1ib2xzXCI6IFtcImQwMV8zMVwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH0sXG4gICAge1wibmFtZVwiOiBcImRhdGV0aW1lJGVibmYkMSRzdWJleHByZXNzaW9uJDFcIiwgXCJzeW1ib2xzXCI6IFtcInRpbWV6b25lXCJdLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwiZGF0ZXRpbWUkZWJuZiQxXCIsIFwic3ltYm9sc1wiOiBbXCJkYXRldGltZSRlYm5mJDEkc3ViZXhwcmVzc2lvbiQxXCJdLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwiZGF0ZXRpbWUkZWJuZiQxXCIsIFwic3ltYm9sc1wiOiBbXSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbihkKSB7cmV0dXJuIG51bGw7fX0sXG4gICAge1wibmFtZVwiOiBcImRhdGV0aW1lXCIsIFwic3ltYm9sc1wiOiBbXCJ5ZWFyX21vbnRoX2RheVwiLCB7XCJsaXRlcmFsXCI6XCJUXCJ9LCBcInRpbWVcIiwgXCJkYXRldGltZSRlYm5mJDFcIl0sIFwicG9zdHByb2Nlc3NcIjogZGF0ZXRpbWV9LFxuICAgIHtcIm5hbWVcIjogXCJ0aW1lXCIsIFwic3ltYm9sc1wiOiBbXCJob3Vyc1wiLCB7XCJsaXRlcmFsXCI6XCI6XCJ9LCBcIm1pbnV0ZXNcIiwge1wibGl0ZXJhbFwiOlwiOlwifSwgXCJzZWNvbmRzXCIsIFwibWlsbGlzZWNvbmRzXCJdLCBcInBvc3Rwcm9jZXNzXCI6IHBpY2soMCwgMiwgNCwgNSl9LFxuICAgIHtcIm5hbWVcIjogXCJ0aW1lXCIsIFwic3ltYm9sc1wiOiBbXCJob3Vyc1wiLCB7XCJsaXRlcmFsXCI6XCI6XCJ9LCBcIm1pbnV0ZXNcIl0sIFwicG9zdHByb2Nlc3NcIjogcGljaygwLCAyKX0sXG4gICAge1wibmFtZVwiOiBcInRpbWUkc3RyaW5nJDFcIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCIyXCJ9LCB7XCJsaXRlcmFsXCI6XCI0XCJ9LCB7XCJsaXRlcmFsXCI6XCI6XCJ9LCB7XCJsaXRlcmFsXCI6XCIwXCJ9LCB7XCJsaXRlcmFsXCI6XCIwXCJ9XSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbiBqb2luZXIoZCkge3JldHVybiBkLmpvaW4oJycpO319LFxuICAgIHtcIm5hbWVcIjogXCJ0aW1lJGVibmYkMSRzdHJpbmckMVwiLCBcInN5bWJvbHNcIjogW3tcImxpdGVyYWxcIjpcIjpcIn0sIHtcImxpdGVyYWxcIjpcIjBcIn0sIHtcImxpdGVyYWxcIjpcIjBcIn1dLCBcInBvc3Rwcm9jZXNzXCI6IGZ1bmN0aW9uIGpvaW5lcihkKSB7cmV0dXJuIGQuam9pbignJyk7fX0sXG4gICAge1wibmFtZVwiOiBcInRpbWUkZWJuZiQxXCIsIFwic3ltYm9sc1wiOiBbXCJ0aW1lJGVibmYkMSRzdHJpbmckMVwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH0sXG4gICAge1wibmFtZVwiOiBcInRpbWUkZWJuZiQxXCIsIFwic3ltYm9sc1wiOiBbXSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbihkKSB7cmV0dXJuIG51bGw7fX0sXG4gICAge1wibmFtZVwiOiBcInRpbWVcIiwgXCJzeW1ib2xzXCI6IFtcInRpbWUkc3RyaW5nJDFcIiwgXCJ0aW1lJGVibmYkMVwiXSwgXCJwb3N0cHJvY2Vzc1wiOiAoKSA9PiBbMjQsIDAsIDBdfSxcbiAgICB7XCJuYW1lXCI6IFwiaG91cnNcIiwgXCJzeW1ib2xzXCI6IFtcImQwMF8yM1wiXSwgXCJwb3N0cHJvY2Vzc1wiOiBudW19LFxuICAgIHtcIm5hbWVcIjogXCJtaW51dGVzXCIsIFwic3ltYm9sc1wiOiBbXCJkMDBfNTlcIl0sIFwicG9zdHByb2Nlc3NcIjogbnVtfSxcbiAgICB7XCJuYW1lXCI6IFwic2Vjb25kc1wiLCBcInN5bWJvbHNcIjogW1wiZDAwXzU5XCJdLCBcInBvc3Rwcm9jZXNzXCI6IG51bX0sXG4gICAge1wibmFtZVwiOiBcIm1pbGxpc2Vjb25kc1wiLCBcInN5bWJvbHNcIjogW119LFxuICAgIHtcIm5hbWVcIjogXCJtaWxsaXNlY29uZHNcIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCIuXCJ9LCBcImQzXCJdLCBcInBvc3Rwcm9jZXNzXCI6IGRhdGEgPT4gbnVtKGRhdGEuc2xpY2UoMSkpfSxcbiAgICB7XCJuYW1lXCI6IFwidGltZXpvbmVcIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCJaXCJ9XSwgXCJwb3N0cHJvY2Vzc1wiOiB6ZXJvfSxcbiAgICB7XCJuYW1lXCI6IFwidGltZXpvbmUkc3ViZXhwcmVzc2lvbiQxXCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiLVwifV19LFxuICAgIHtcIm5hbWVcIjogXCJ0aW1lem9uZSRzdWJleHByZXNzaW9uJDFcIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCLiiJJcIn1dfSxcbiAgICB7XCJuYW1lXCI6IFwidGltZXpvbmVcIiwgXCJzeW1ib2xzXCI6IFtcInRpbWV6b25lJHN1YmV4cHJlc3Npb24kMVwiLCBcIm9mZnNldFwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBkYXRhID0+IC1kYXRhWzFdfSxcbiAgICB7XCJuYW1lXCI6IFwidGltZXpvbmVcIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCIrXCJ9LCBcInBvc2l0aXZlX29mZnNldFwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBwaWNrKDEpfSxcbiAgICB7XCJuYW1lXCI6IFwicG9zaXRpdmVfb2Zmc2V0XCIsIFwic3ltYm9sc1wiOiBbXCJvZmZzZXRcIl0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJwb3NpdGl2ZV9vZmZzZXQkc3RyaW5nJDFcIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCIwXCJ9LCB7XCJsaXRlcmFsXCI6XCIwXCJ9XSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbiBqb2luZXIoZCkge3JldHVybiBkLmpvaW4oJycpO319LFxuICAgIHtcIm5hbWVcIjogXCJwb3NpdGl2ZV9vZmZzZXQkZWJuZiQxXCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiOlwifV0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJwb3NpdGl2ZV9vZmZzZXQkZWJuZiQxXCIsIFwic3ltYm9sc1wiOiBbXSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbihkKSB7cmV0dXJuIG51bGw7fX0sXG4gICAge1wibmFtZVwiOiBcInBvc2l0aXZlX29mZnNldCRzdHJpbmckMlwiLCBcInN5bWJvbHNcIjogW3tcImxpdGVyYWxcIjpcIjBcIn0sIHtcImxpdGVyYWxcIjpcIjBcIn1dLCBcInBvc3Rwcm9jZXNzXCI6IGZ1bmN0aW9uIGpvaW5lcihkKSB7cmV0dXJuIGQuam9pbignJyk7fX0sXG4gICAge1wibmFtZVwiOiBcInBvc2l0aXZlX29mZnNldFwiLCBcInN5bWJvbHNcIjogW1wicG9zaXRpdmVfb2Zmc2V0JHN0cmluZyQxXCIsIFwicG9zaXRpdmVfb2Zmc2V0JGVibmYkMVwiLCBcInBvc2l0aXZlX29mZnNldCRzdHJpbmckMlwiXSwgXCJwb3N0cHJvY2Vzc1wiOiB6ZXJvfSxcbiAgICB7XCJuYW1lXCI6IFwicG9zaXRpdmVfb2Zmc2V0JHN1YmV4cHJlc3Npb24kMSRzdHJpbmckMVwiLCBcInN5bWJvbHNcIjogW3tcImxpdGVyYWxcIjpcIjFcIn0sIHtcImxpdGVyYWxcIjpcIjJcIn1dLCBcInBvc3Rwcm9jZXNzXCI6IGZ1bmN0aW9uIGpvaW5lcihkKSB7cmV0dXJuIGQuam9pbignJyk7fX0sXG4gICAge1wibmFtZVwiOiBcInBvc2l0aXZlX29mZnNldCRzdWJleHByZXNzaW9uJDFcIiwgXCJzeW1ib2xzXCI6IFtcInBvc2l0aXZlX29mZnNldCRzdWJleHByZXNzaW9uJDEkc3RyaW5nJDFcIl19LFxuICAgIHtcIm5hbWVcIjogXCJwb3NpdGl2ZV9vZmZzZXQkc3ViZXhwcmVzc2lvbiQxJHN0cmluZyQyXCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiMVwifSwge1wibGl0ZXJhbFwiOlwiM1wifV0sIFwicG9zdHByb2Nlc3NcIjogZnVuY3Rpb24gam9pbmVyKGQpIHtyZXR1cm4gZC5qb2luKCcnKTt9fSxcbiAgICB7XCJuYW1lXCI6IFwicG9zaXRpdmVfb2Zmc2V0JHN1YmV4cHJlc3Npb24kMVwiLCBcInN5bWJvbHNcIjogW1wicG9zaXRpdmVfb2Zmc2V0JHN1YmV4cHJlc3Npb24kMSRzdHJpbmckMlwiXX0sXG4gICAge1wibmFtZVwiOiBcInBvc2l0aXZlX29mZnNldCRlYm5mJDJcIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCI6XCJ9XSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH0sXG4gICAge1wibmFtZVwiOiBcInBvc2l0aXZlX29mZnNldCRlYm5mJDJcIiwgXCJzeW1ib2xzXCI6IFtdLCBcInBvc3Rwcm9jZXNzXCI6IGZ1bmN0aW9uKGQpIHtyZXR1cm4gbnVsbDt9fSxcbiAgICB7XCJuYW1lXCI6IFwicG9zaXRpdmVfb2Zmc2V0XCIsIFwic3ltYm9sc1wiOiBbXCJwb3NpdGl2ZV9vZmZzZXQkc3ViZXhwcmVzc2lvbiQxXCIsIFwicG9zaXRpdmVfb2Zmc2V0JGVibmYkMlwiLCBcIm1pbnV0ZXNcIl0sIFwicG9zdHByb2Nlc3NcIjogZGF0YSA9PiBudW0oZGF0YVswXSkgKiA2MCArIGRhdGFbMl19LFxuICAgIHtcIm5hbWVcIjogXCJwb3NpdGl2ZV9vZmZzZXQkc3RyaW5nJDNcIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCIxXCJ9LCB7XCJsaXRlcmFsXCI6XCI0XCJ9XSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbiBqb2luZXIoZCkge3JldHVybiBkLmpvaW4oJycpO319LFxuICAgIHtcIm5hbWVcIjogXCJwb3NpdGl2ZV9vZmZzZXQkZWJuZiQzXCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiOlwifV0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJwb3NpdGl2ZV9vZmZzZXQkZWJuZiQzXCIsIFwic3ltYm9sc1wiOiBbXSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbihkKSB7cmV0dXJuIG51bGw7fX0sXG4gICAge1wibmFtZVwiOiBcInBvc2l0aXZlX29mZnNldCRzdHJpbmckNFwiLCBcInN5bWJvbHNcIjogW3tcImxpdGVyYWxcIjpcIjBcIn0sIHtcImxpdGVyYWxcIjpcIjBcIn1dLCBcInBvc3Rwcm9jZXNzXCI6IGZ1bmN0aW9uIGpvaW5lcihkKSB7cmV0dXJuIGQuam9pbignJyk7fX0sXG4gICAge1wibmFtZVwiOiBcInBvc2l0aXZlX29mZnNldFwiLCBcInN5bWJvbHNcIjogW1wicG9zaXRpdmVfb2Zmc2V0JHN0cmluZyQzXCIsIFwicG9zaXRpdmVfb2Zmc2V0JGVibmYkM1wiLCBcInBvc2l0aXZlX29mZnNldCRzdHJpbmckNFwiXSwgXCJwb3N0cHJvY2Vzc1wiOiAoKSA9PiA4NDB9LFxuICAgIHtcIm5hbWVcIjogXCJwb3NpdGl2ZV9vZmZzZXRcIiwgXCJzeW1ib2xzXCI6IFtcImQwMF8xNFwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBkYXRhID0+IG51bShkYXRhWzBdKSAqIDYwfSxcbiAgICB7XCJuYW1lXCI6IFwib2Zmc2V0JGVibmYkMVwiLCBcInN5bWJvbHNcIjogW3tcImxpdGVyYWxcIjpcIjpcIn1dLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwib2Zmc2V0JGVibmYkMVwiLCBcInN5bWJvbHNcIjogW10sIFwicG9zdHByb2Nlc3NcIjogZnVuY3Rpb24oZCkge3JldHVybiBudWxsO319LFxuICAgIHtcIm5hbWVcIjogXCJvZmZzZXRcIiwgXCJzeW1ib2xzXCI6IFtcImQwMV8xMVwiLCBcIm9mZnNldCRlYm5mJDFcIiwgXCJtaW51dGVzXCJdLCBcInBvc3Rwcm9jZXNzXCI6IGRhdGEgPT4gbnVtKGRhdGFbMF0pICogNjAgKyBkYXRhWzJdfSxcbiAgICB7XCJuYW1lXCI6IFwib2Zmc2V0JHN0cmluZyQxXCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiMFwifSwge1wibGl0ZXJhbFwiOlwiMFwifV0sIFwicG9zdHByb2Nlc3NcIjogZnVuY3Rpb24gam9pbmVyKGQpIHtyZXR1cm4gZC5qb2luKCcnKTt9fSxcbiAgICB7XCJuYW1lXCI6IFwib2Zmc2V0JGVibmYkMlwiLCBcInN5bWJvbHNcIjogW3tcImxpdGVyYWxcIjpcIjpcIn1dLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwib2Zmc2V0JGVibmYkMlwiLCBcInN5bWJvbHNcIjogW10sIFwicG9zdHByb2Nlc3NcIjogZnVuY3Rpb24oZCkge3JldHVybiBudWxsO319LFxuICAgIHtcIm5hbWVcIjogXCJvZmZzZXRcIiwgXCJzeW1ib2xzXCI6IFtcIm9mZnNldCRzdHJpbmckMVwiLCBcIm9mZnNldCRlYm5mJDJcIiwgXCJkMDFfNTlcIl0sIFwicG9zdHByb2Nlc3NcIjogZGF0YSA9PiBudW0oZGF0YVsyXSl9LFxuICAgIHtcIm5hbWVcIjogXCJvZmZzZXQkc3RyaW5nJDJcIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCIxXCJ9LCB7XCJsaXRlcmFsXCI6XCIyXCJ9XSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbiBqb2luZXIoZCkge3JldHVybiBkLmpvaW4oJycpO319LFxuICAgIHtcIm5hbWVcIjogXCJvZmZzZXQkZWJuZiQzXCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiOlwifV0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJvZmZzZXQkZWJuZiQzXCIsIFwic3ltYm9sc1wiOiBbXSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbihkKSB7cmV0dXJuIG51bGw7fX0sXG4gICAge1wibmFtZVwiOiBcIm9mZnNldCRzdHJpbmckM1wiLCBcInN5bWJvbHNcIjogW3tcImxpdGVyYWxcIjpcIjBcIn0sIHtcImxpdGVyYWxcIjpcIjBcIn1dLCBcInBvc3Rwcm9jZXNzXCI6IGZ1bmN0aW9uIGpvaW5lcihkKSB7cmV0dXJuIGQuam9pbignJyk7fX0sXG4gICAge1wibmFtZVwiOiBcIm9mZnNldFwiLCBcInN5bWJvbHNcIjogW1wib2Zmc2V0JHN0cmluZyQyXCIsIFwib2Zmc2V0JGVibmYkM1wiLCBcIm9mZnNldCRzdHJpbmckM1wiXSwgXCJwb3N0cHJvY2Vzc1wiOiAoKSA9PiA3MjB9LFxuICAgIHtcIm5hbWVcIjogXCJvZmZzZXRcIiwgXCJzeW1ib2xzXCI6IFtcImQwMV8xMlwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBkYXRhID0+IG51bShkYXRhWzBdKSAqIDYwfSxcbiAgICB7XCJuYW1lXCI6IFwiTDFcIiwgXCJzeW1ib2xzXCI6IFtcIkwxZFwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH0sXG4gICAge1wibmFtZVwiOiBcIkwxXCIsIFwic3ltYm9sc1wiOiBbXCJMMVlcIl0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJMMVwiLCBcInN5bWJvbHNcIjogW1wiTDFTXCJdLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwiTDFcIiwgXCJzeW1ib2xzXCI6IFtcIkwxaVwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH0sXG4gICAge1wibmFtZVwiOiBcIkwxZFwiLCBcInN5bWJvbHNcIjogW1wiZGF0ZV91YVwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH0sXG4gICAge1wibmFtZVwiOiBcIkwxZFwiLCBcInN5bWJvbHNcIjogW1wiTDFYXCJdLCBcInBvc3Rwcm9jZXNzXCI6IG1lcmdlKDAsIHsgdHlwZTogJ0RhdGUnLCBsZXZlbDogMSB9KX0sXG4gICAge1wibmFtZVwiOiBcImRhdGVfdWFcIiwgXCJzeW1ib2xzXCI6IFtcImRhdGVcIiwgXCJVQVwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBtZXJnZSgwLCAxLCB7IGxldmVsOiAxIH0pfSxcbiAgICB7XCJuYW1lXCI6IFwiTDFpXCIsIFwic3ltYm9sc1wiOiBbXCJMMWlfZGF0ZVwiLCB7XCJsaXRlcmFsXCI6XCIvXCJ9LCBcIkwxaV9kYXRlXCJdLCBcInBvc3Rwcm9jZXNzXCI6IGludGVydmFsKDEpfSxcbiAgICB7XCJuYW1lXCI6IFwiTDFpXCIsIFwic3ltYm9sc1wiOiBbXCJkYXRlX3RpbWVcIiwge1wibGl0ZXJhbFwiOlwiL1wifSwgXCJMMWlfZGF0ZVwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBpbnRlcnZhbCgxKX0sXG4gICAge1wibmFtZVwiOiBcIkwxaVwiLCBcInN5bWJvbHNcIjogW1wiTDFpX2RhdGVcIiwge1wibGl0ZXJhbFwiOlwiL1wifSwgXCJkYXRlX3RpbWVcIl0sIFwicG9zdHByb2Nlc3NcIjogaW50ZXJ2YWwoMSl9LFxuICAgIHtcIm5hbWVcIjogXCJMMWlfZGF0ZVwiLCBcInN5bWJvbHNcIjogW10sIFwicG9zdHByb2Nlc3NcIjogbm90aGluZ30sXG4gICAge1wibmFtZVwiOiBcIkwxaV9kYXRlXCIsIFwic3ltYm9sc1wiOiBbXCJkYXRlX3VhXCJdLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwiTDFpX2RhdGVcIiwgXCJzeW1ib2xzXCI6IFtcIklORklOSVRZXCJdLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwiSU5GSU5JVFkkc3RyaW5nJDFcIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCIuXCJ9LCB7XCJsaXRlcmFsXCI6XCIuXCJ9XSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbiBqb2luZXIoZCkge3JldHVybiBkLmpvaW4oJycpO319LFxuICAgIHtcIm5hbWVcIjogXCJJTkZJTklUWVwiLCBcInN5bWJvbHNcIjogW1wiSU5GSU5JVFkkc3RyaW5nJDFcIl0sIFwicG9zdHByb2Nlc3NcIjogKCkgPT4gSW5maW5pdHl9LFxuICAgIHtcIm5hbWVcIjogXCJMMVgkc3RyaW5nJDFcIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCItXCJ9LCB7XCJsaXRlcmFsXCI6XCJYXCJ9LCB7XCJsaXRlcmFsXCI6XCJYXCJ9XSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbiBqb2luZXIoZCkge3JldHVybiBkLmpvaW4oJycpO319LFxuICAgIHtcIm5hbWVcIjogXCJMMVhcIiwgXCJzeW1ib2xzXCI6IFtcIm5kNFwiLCB7XCJsaXRlcmFsXCI6XCItXCJ9LCBcIm1kXCIsIFwiTDFYJHN0cmluZyQxXCJdLCBcInBvc3Rwcm9jZXNzXCI6IG1hc2tlZCgpfSxcbiAgICB7XCJuYW1lXCI6IFwiTDFYJHN0cmluZyQyXCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiLVwifSwge1wibGl0ZXJhbFwiOlwiWFwifSwge1wibGl0ZXJhbFwiOlwiWFwifSwge1wibGl0ZXJhbFwiOlwiLVwifSwge1wibGl0ZXJhbFwiOlwiWFwifSwge1wibGl0ZXJhbFwiOlwiWFwifV0sIFwicG9zdHByb2Nlc3NcIjogZnVuY3Rpb24gam9pbmVyKGQpIHtyZXR1cm4gZC5qb2luKCcnKTt9fSxcbiAgICB7XCJuYW1lXCI6IFwiTDFYXCIsIFwic3ltYm9sc1wiOiBbXCJuZDRcIiwgXCJMMVgkc3RyaW5nJDJcIl0sIFwicG9zdHByb2Nlc3NcIjogbWFza2VkKCl9LFxuICAgIHtcIm5hbWVcIjogXCJMMVgkc3RyaW5nJDNcIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCJYXCJ9LCB7XCJsaXRlcmFsXCI6XCJYXCJ9LCB7XCJsaXRlcmFsXCI6XCJYXCJ9LCB7XCJsaXRlcmFsXCI6XCJYXCJ9LCB7XCJsaXRlcmFsXCI6XCItXCJ9LCB7XCJsaXRlcmFsXCI6XCJYXCJ9LCB7XCJsaXRlcmFsXCI6XCJYXCJ9LCB7XCJsaXRlcmFsXCI6XCItXCJ9LCB7XCJsaXRlcmFsXCI6XCJYXCJ9LCB7XCJsaXRlcmFsXCI6XCJYXCJ9XSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbiBqb2luZXIoZCkge3JldHVybiBkLmpvaW4oJycpO319LFxuICAgIHtcIm5hbWVcIjogXCJMMVhcIiwgXCJzeW1ib2xzXCI6IFtcIkwxWCRzdHJpbmckM1wiXSwgXCJwb3N0cHJvY2Vzc1wiOiBtYXNrZWQoKX0sXG4gICAge1wibmFtZVwiOiBcIkwxWCRzdHJpbmckNFwiLCBcInN5bWJvbHNcIjogW3tcImxpdGVyYWxcIjpcIi1cIn0sIHtcImxpdGVyYWxcIjpcIlhcIn0sIHtcImxpdGVyYWxcIjpcIlhcIn1dLCBcInBvc3Rwcm9jZXNzXCI6IGZ1bmN0aW9uIGpvaW5lcihkKSB7cmV0dXJuIGQuam9pbignJyk7fX0sXG4gICAge1wibmFtZVwiOiBcIkwxWFwiLCBcInN5bWJvbHNcIjogW1wibmQ0XCIsIFwiTDFYJHN0cmluZyQ0XCJdLCBcInBvc3Rwcm9jZXNzXCI6IG1hc2tlZCgpfSxcbiAgICB7XCJuYW1lXCI6IFwiTDFYJHN0cmluZyQ1XCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiWFwifSwge1wibGl0ZXJhbFwiOlwiWFwifSwge1wibGl0ZXJhbFwiOlwiWFwifSwge1wibGl0ZXJhbFwiOlwiWFwifSwge1wibGl0ZXJhbFwiOlwiLVwifSwge1wibGl0ZXJhbFwiOlwiWFwifSwge1wibGl0ZXJhbFwiOlwiWFwifV0sIFwicG9zdHByb2Nlc3NcIjogZnVuY3Rpb24gam9pbmVyKGQpIHtyZXR1cm4gZC5qb2luKCcnKTt9fSxcbiAgICB7XCJuYW1lXCI6IFwiTDFYXCIsIFwic3ltYm9sc1wiOiBbXCJMMVgkc3RyaW5nJDVcIl0sIFwicG9zdHByb2Nlc3NcIjogbWFza2VkKCl9LFxuICAgIHtcIm5hbWVcIjogXCJMMVgkc3RyaW5nJDZcIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCJYXCJ9LCB7XCJsaXRlcmFsXCI6XCJYXCJ9XSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbiBqb2luZXIoZCkge3JldHVybiBkLmpvaW4oJycpO319LFxuICAgIHtcIm5hbWVcIjogXCJMMVhcIiwgXCJzeW1ib2xzXCI6IFtcIm5kMlwiLCBcIkwxWCRzdHJpbmckNlwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBtYXNrZWQoKX0sXG4gICAge1wibmFtZVwiOiBcIkwxWFwiLCBcInN5bWJvbHNcIjogW1wibmQzXCIsIHtcImxpdGVyYWxcIjpcIlhcIn1dLCBcInBvc3Rwcm9jZXNzXCI6IG1hc2tlZCgpfSxcbiAgICB7XCJuYW1lXCI6IFwiTDFYJHN0cmluZyQ3XCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiWFwifSwge1wibGl0ZXJhbFwiOlwiWFwifSwge1wibGl0ZXJhbFwiOlwiWFwifSwge1wibGl0ZXJhbFwiOlwiWFwifV0sIFwicG9zdHByb2Nlc3NcIjogZnVuY3Rpb24gam9pbmVyKGQpIHtyZXR1cm4gZC5qb2luKCcnKTt9fSxcbiAgICB7XCJuYW1lXCI6IFwiTDFYXCIsIFwic3ltYm9sc1wiOiBbXCJMMVgkc3RyaW5nJDdcIl0sIFwicG9zdHByb2Nlc3NcIjogbWFza2VkKCl9LFxuICAgIHtcIm5hbWVcIjogXCJMMVlcIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCJZXCJ9LCBcImQ1K1wiXSwgXCJwb3N0cHJvY2Vzc1wiOiBkYXRhID0+IHllYXIoW251bShkYXRhWzFdKV0sIDEpfSxcbiAgICB7XCJuYW1lXCI6IFwiTDFZJHN0cmluZyQxXCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiWVwifSwge1wibGl0ZXJhbFwiOlwiLVwifV0sIFwicG9zdHByb2Nlc3NcIjogZnVuY3Rpb24gam9pbmVyKGQpIHtyZXR1cm4gZC5qb2luKCcnKTt9fSxcbiAgICB7XCJuYW1lXCI6IFwiTDFZXCIsIFwic3ltYm9sc1wiOiBbXCJMMVkkc3RyaW5nJDFcIiwgXCJkNStcIl0sIFwicG9zdHByb2Nlc3NcIjogZGF0YSA9PiB5ZWFyKFstbnVtKGRhdGFbMV0pXSwgMSl9LFxuICAgIHtcIm5hbWVcIjogXCJVQVwiLCBcInN5bWJvbHNcIjogW3tcImxpdGVyYWxcIjpcIj9cIn1dLCBcInBvc3Rwcm9jZXNzXCI6ICgpID0+ICh7IHVuY2VydGFpbjogdHJ1ZSB9KX0sXG4gICAge1wibmFtZVwiOiBcIlVBXCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiflwifV0sIFwicG9zdHByb2Nlc3NcIjogKCkgPT4gKHsgYXBwcm94aW1hdGU6IHRydWUgfSl9LFxuICAgIHtcIm5hbWVcIjogXCJVQVwiLCBcInN5bWJvbHNcIjogW3tcImxpdGVyYWxcIjpcIiVcIn1dLCBcInBvc3Rwcm9jZXNzXCI6ICgpID0+ICh7IGFwcHJveGltYXRlOiB0cnVlLCB1bmNlcnRhaW46IHRydWUgfSl9LFxuICAgIHtcIm5hbWVcIjogXCJMMVNcIiwgXCJzeW1ib2xzXCI6IFtcInllYXJcIiwge1wibGl0ZXJhbFwiOlwiLVwifSwgXCJkMjFfMjRcIl0sIFwicG9zdHByb2Nlc3NcIjogZGF0YSA9PiBzZWFzb24oZGF0YSwgMSl9LFxuICAgIHtcIm5hbWVcIjogXCJMMlwiLCBcInN5bWJvbHNcIjogW1wiTDJkXCJdLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwiTDJcIiwgXCJzeW1ib2xzXCI6IFtcIkwyWVwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH0sXG4gICAge1wibmFtZVwiOiBcIkwyXCIsIFwic3ltYm9sc1wiOiBbXCJMMlNcIl0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJMMlwiLCBcInN5bWJvbHNcIjogW1wiTDJEXCJdLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwiTDJcIiwgXCJzeW1ib2xzXCI6IFtcIkwyQ1wiXSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH0sXG4gICAge1wibmFtZVwiOiBcIkwyXCIsIFwic3ltYm9sc1wiOiBbXCJMMmlcIl0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJMMlwiLCBcInN5bWJvbHNcIjogW1wic2V0XCJdLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwiTDJcIiwgXCJzeW1ib2xzXCI6IFtcImxpc3RcIl0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJMMmRcIiwgXCJzeW1ib2xzXCI6IFtcInVhX2RhdGVcIl0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJMMmRcIiwgXCJzeW1ib2xzXCI6IFtcIkwyWFwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBtZXJnZSgwLCB7IHR5cGU6ICdEYXRlJywgbGV2ZWw6IDIgfSl9LFxuICAgIHtcIm5hbWVcIjogXCJMMkRcIiwgXCJzeW1ib2xzXCI6IFtcImRlY2FkZVwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH0sXG4gICAge1wibmFtZVwiOiBcIkwyRFwiLCBcInN5bWJvbHNcIjogW1wiZGVjYWRlXCIsIFwiVUFcIl0sIFwicG9zdHByb2Nlc3NcIjogbWVyZ2UoMCwgMSl9LFxuICAgIHtcIm5hbWVcIjogXCJMMkNcIiwgXCJzeW1ib2xzXCI6IFtcImNlbnR1cnlcIl0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJMMkNcIiwgXCJzeW1ib2xzXCI6IFtcImNlbnR1cnlcIiwgXCJVQVwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBtZXJnZSgwLCAxLCB7bGV2ZWw6IDJ9KX0sXG4gICAge1wibmFtZVwiOiBcInVhX2RhdGVcIiwgXCJzeW1ib2xzXCI6IFtcInVhX3llYXJcIl0sIFwicG9zdHByb2Nlc3NcIjogcXVhbGlmeX0sXG4gICAge1wibmFtZVwiOiBcInVhX2RhdGVcIiwgXCJzeW1ib2xzXCI6IFtcInVhX3llYXJfbW9udGhcIl0sIFwicG9zdHByb2Nlc3NcIjogcXVhbGlmeX0sXG4gICAge1wibmFtZVwiOiBcInVhX2RhdGVcIiwgXCJzeW1ib2xzXCI6IFtcInVhX3llYXJfbW9udGhfZGF5XCJdLCBcInBvc3Rwcm9jZXNzXCI6IHF1YWxpZnl9LFxuICAgIHtcIm5hbWVcIjogXCJ1YV95ZWFyXCIsIFwic3ltYm9sc1wiOiBbXCJVQVwiLCBcInllYXJcIl0sIFwicG9zdHByb2Nlc3NcIjogZGF0YSA9PiBbZGF0YV19LFxuICAgIHtcIm5hbWVcIjogXCJ1YV95ZWFyX21vbnRoJG1hY3JvY2FsbCQyXCIsIFwic3ltYm9sc1wiOiBbXCJ5ZWFyXCJdfSxcbiAgICB7XCJuYW1lXCI6IFwidWFfeWVhcl9tb250aCRtYWNyb2NhbGwkMSRlYm5mJDFcIiwgXCJzeW1ib2xzXCI6IFtcIlVBXCJdLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwidWFfeWVhcl9tb250aCRtYWNyb2NhbGwkMSRlYm5mJDFcIiwgXCJzeW1ib2xzXCI6IFtdLCBcInBvc3Rwcm9jZXNzXCI6IGZ1bmN0aW9uKGQpIHtyZXR1cm4gbnVsbDt9fSxcbiAgICB7XCJuYW1lXCI6IFwidWFfeWVhcl9tb250aCRtYWNyb2NhbGwkMSRlYm5mJDJcIiwgXCJzeW1ib2xzXCI6IFtcIlVBXCJdLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwidWFfeWVhcl9tb250aCRtYWNyb2NhbGwkMSRlYm5mJDJcIiwgXCJzeW1ib2xzXCI6IFtdLCBcInBvc3Rwcm9jZXNzXCI6IGZ1bmN0aW9uKGQpIHtyZXR1cm4gbnVsbDt9fSxcbiAgICB7XCJuYW1lXCI6IFwidWFfeWVhcl9tb250aCRtYWNyb2NhbGwkMVwiLCBcInN5bWJvbHNcIjogW1widWFfeWVhcl9tb250aCRtYWNyb2NhbGwkMSRlYm5mJDFcIiwgXCJ1YV95ZWFyX21vbnRoJG1hY3JvY2FsbCQyXCIsIFwidWFfeWVhcl9tb250aCRtYWNyb2NhbGwkMSRlYm5mJDJcIl19LFxuICAgIHtcIm5hbWVcIjogXCJ1YV95ZWFyX21vbnRoJG1hY3JvY2FsbCQ0XCIsIFwic3ltYm9sc1wiOiBbXCJtb250aFwiXX0sXG4gICAge1wibmFtZVwiOiBcInVhX3llYXJfbW9udGgkbWFjcm9jYWxsJDMkZWJuZiQxXCIsIFwic3ltYm9sc1wiOiBbXCJVQVwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH0sXG4gICAge1wibmFtZVwiOiBcInVhX3llYXJfbW9udGgkbWFjcm9jYWxsJDMkZWJuZiQxXCIsIFwic3ltYm9sc1wiOiBbXSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbihkKSB7cmV0dXJuIG51bGw7fX0sXG4gICAge1wibmFtZVwiOiBcInVhX3llYXJfbW9udGgkbWFjcm9jYWxsJDMkZWJuZiQyXCIsIFwic3ltYm9sc1wiOiBbXCJVQVwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH0sXG4gICAge1wibmFtZVwiOiBcInVhX3llYXJfbW9udGgkbWFjcm9jYWxsJDMkZWJuZiQyXCIsIFwic3ltYm9sc1wiOiBbXSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbihkKSB7cmV0dXJuIG51bGw7fX0sXG4gICAge1wibmFtZVwiOiBcInVhX3llYXJfbW9udGgkbWFjcm9jYWxsJDNcIiwgXCJzeW1ib2xzXCI6IFtcInVhX3llYXJfbW9udGgkbWFjcm9jYWxsJDMkZWJuZiQxXCIsIFwidWFfeWVhcl9tb250aCRtYWNyb2NhbGwkNFwiLCBcInVhX3llYXJfbW9udGgkbWFjcm9jYWxsJDMkZWJuZiQyXCJdfSxcbiAgICB7XCJuYW1lXCI6IFwidWFfeWVhcl9tb250aFwiLCBcInN5bWJvbHNcIjogW1widWFfeWVhcl9tb250aCRtYWNyb2NhbGwkMVwiLCB7XCJsaXRlcmFsXCI6XCItXCJ9LCBcInVhX3llYXJfbW9udGgkbWFjcm9jYWxsJDNcIl0sIFwicG9zdHByb2Nlc3NcIjogcGx1Y2soMCwgMil9LFxuICAgIHtcIm5hbWVcIjogXCJ1YV95ZWFyX21vbnRoX2RheSRtYWNyb2NhbGwkMlwiLCBcInN5bWJvbHNcIjogW1wieWVhclwiXX0sXG4gICAge1wibmFtZVwiOiBcInVhX3llYXJfbW9udGhfZGF5JG1hY3JvY2FsbCQxJGVibmYkMVwiLCBcInN5bWJvbHNcIjogW1wiVUFcIl0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJ1YV95ZWFyX21vbnRoX2RheSRtYWNyb2NhbGwkMSRlYm5mJDFcIiwgXCJzeW1ib2xzXCI6IFtdLCBcInBvc3Rwcm9jZXNzXCI6IGZ1bmN0aW9uKGQpIHtyZXR1cm4gbnVsbDt9fSxcbiAgICB7XCJuYW1lXCI6IFwidWFfeWVhcl9tb250aF9kYXkkbWFjcm9jYWxsJDEkZWJuZiQyXCIsIFwic3ltYm9sc1wiOiBbXCJVQVwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH0sXG4gICAge1wibmFtZVwiOiBcInVhX3llYXJfbW9udGhfZGF5JG1hY3JvY2FsbCQxJGVibmYkMlwiLCBcInN5bWJvbHNcIjogW10sIFwicG9zdHByb2Nlc3NcIjogZnVuY3Rpb24oZCkge3JldHVybiBudWxsO319LFxuICAgIHtcIm5hbWVcIjogXCJ1YV95ZWFyX21vbnRoX2RheSRtYWNyb2NhbGwkMVwiLCBcInN5bWJvbHNcIjogW1widWFfeWVhcl9tb250aF9kYXkkbWFjcm9jYWxsJDEkZWJuZiQxXCIsIFwidWFfeWVhcl9tb250aF9kYXkkbWFjcm9jYWxsJDJcIiwgXCJ1YV95ZWFyX21vbnRoX2RheSRtYWNyb2NhbGwkMSRlYm5mJDJcIl19LFxuICAgIHtcIm5hbWVcIjogXCJ1YV95ZWFyX21vbnRoX2RheVwiLCBcInN5bWJvbHNcIjogW1widWFfeWVhcl9tb250aF9kYXkkbWFjcm9jYWxsJDFcIiwge1wibGl0ZXJhbFwiOlwiLVwifSwgXCJ1YV9tb250aF9kYXlcIl0sIFwicG9zdHByb2Nlc3NcIjogZGF0YSA9PiBbZGF0YVswXSwgLi4uZGF0YVsyXV19LFxuICAgIHtcIm5hbWVcIjogXCJ1YV9tb250aF9kYXkkbWFjcm9jYWxsJDJcIiwgXCJzeW1ib2xzXCI6IFtcIm0zMVwiXX0sXG4gICAge1wibmFtZVwiOiBcInVhX21vbnRoX2RheSRtYWNyb2NhbGwkMSRlYm5mJDFcIiwgXCJzeW1ib2xzXCI6IFtcIlVBXCJdLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwidWFfbW9udGhfZGF5JG1hY3JvY2FsbCQxJGVibmYkMVwiLCBcInN5bWJvbHNcIjogW10sIFwicG9zdHByb2Nlc3NcIjogZnVuY3Rpb24oZCkge3JldHVybiBudWxsO319LFxuICAgIHtcIm5hbWVcIjogXCJ1YV9tb250aF9kYXkkbWFjcm9jYWxsJDEkZWJuZiQyXCIsIFwic3ltYm9sc1wiOiBbXCJVQVwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH0sXG4gICAge1wibmFtZVwiOiBcInVhX21vbnRoX2RheSRtYWNyb2NhbGwkMSRlYm5mJDJcIiwgXCJzeW1ib2xzXCI6IFtdLCBcInBvc3Rwcm9jZXNzXCI6IGZ1bmN0aW9uKGQpIHtyZXR1cm4gbnVsbDt9fSxcbiAgICB7XCJuYW1lXCI6IFwidWFfbW9udGhfZGF5JG1hY3JvY2FsbCQxXCIsIFwic3ltYm9sc1wiOiBbXCJ1YV9tb250aF9kYXkkbWFjcm9jYWxsJDEkZWJuZiQxXCIsIFwidWFfbW9udGhfZGF5JG1hY3JvY2FsbCQyXCIsIFwidWFfbW9udGhfZGF5JG1hY3JvY2FsbCQxJGVibmYkMlwiXX0sXG4gICAge1wibmFtZVwiOiBcInVhX21vbnRoX2RheSRtYWNyb2NhbGwkNFwiLCBcInN5bWJvbHNcIjogW1wiZGF5XCJdfSxcbiAgICB7XCJuYW1lXCI6IFwidWFfbW9udGhfZGF5JG1hY3JvY2FsbCQzJGVibmYkMVwiLCBcInN5bWJvbHNcIjogW1wiVUFcIl0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJ1YV9tb250aF9kYXkkbWFjcm9jYWxsJDMkZWJuZiQxXCIsIFwic3ltYm9sc1wiOiBbXSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbihkKSB7cmV0dXJuIG51bGw7fX0sXG4gICAge1wibmFtZVwiOiBcInVhX21vbnRoX2RheSRtYWNyb2NhbGwkMyRlYm5mJDJcIiwgXCJzeW1ib2xzXCI6IFtcIlVBXCJdLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwidWFfbW9udGhfZGF5JG1hY3JvY2FsbCQzJGVibmYkMlwiLCBcInN5bWJvbHNcIjogW10sIFwicG9zdHByb2Nlc3NcIjogZnVuY3Rpb24oZCkge3JldHVybiBudWxsO319LFxuICAgIHtcIm5hbWVcIjogXCJ1YV9tb250aF9kYXkkbWFjcm9jYWxsJDNcIiwgXCJzeW1ib2xzXCI6IFtcInVhX21vbnRoX2RheSRtYWNyb2NhbGwkMyRlYm5mJDFcIiwgXCJ1YV9tb250aF9kYXkkbWFjcm9jYWxsJDRcIiwgXCJ1YV9tb250aF9kYXkkbWFjcm9jYWxsJDMkZWJuZiQyXCJdfSxcbiAgICB7XCJuYW1lXCI6IFwidWFfbW9udGhfZGF5XCIsIFwic3ltYm9sc1wiOiBbXCJ1YV9tb250aF9kYXkkbWFjcm9jYWxsJDFcIiwge1wibGl0ZXJhbFwiOlwiLVwifSwgXCJ1YV9tb250aF9kYXkkbWFjcm9jYWxsJDNcIl0sIFwicG9zdHByb2Nlc3NcIjogcGx1Y2soMCwgMil9LFxuICAgIHtcIm5hbWVcIjogXCJ1YV9tb250aF9kYXkkbWFjcm9jYWxsJDZcIiwgXCJzeW1ib2xzXCI6IFtcIm0zMFwiXX0sXG4gICAge1wibmFtZVwiOiBcInVhX21vbnRoX2RheSRtYWNyb2NhbGwkNSRlYm5mJDFcIiwgXCJzeW1ib2xzXCI6IFtcIlVBXCJdLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwidWFfbW9udGhfZGF5JG1hY3JvY2FsbCQ1JGVibmYkMVwiLCBcInN5bWJvbHNcIjogW10sIFwicG9zdHByb2Nlc3NcIjogZnVuY3Rpb24oZCkge3JldHVybiBudWxsO319LFxuICAgIHtcIm5hbWVcIjogXCJ1YV9tb250aF9kYXkkbWFjcm9jYWxsJDUkZWJuZiQyXCIsIFwic3ltYm9sc1wiOiBbXCJVQVwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH0sXG4gICAge1wibmFtZVwiOiBcInVhX21vbnRoX2RheSRtYWNyb2NhbGwkNSRlYm5mJDJcIiwgXCJzeW1ib2xzXCI6IFtdLCBcInBvc3Rwcm9jZXNzXCI6IGZ1bmN0aW9uKGQpIHtyZXR1cm4gbnVsbDt9fSxcbiAgICB7XCJuYW1lXCI6IFwidWFfbW9udGhfZGF5JG1hY3JvY2FsbCQ1XCIsIFwic3ltYm9sc1wiOiBbXCJ1YV9tb250aF9kYXkkbWFjcm9jYWxsJDUkZWJuZiQxXCIsIFwidWFfbW9udGhfZGF5JG1hY3JvY2FsbCQ2XCIsIFwidWFfbW9udGhfZGF5JG1hY3JvY2FsbCQ1JGVibmYkMlwiXX0sXG4gICAge1wibmFtZVwiOiBcInVhX21vbnRoX2RheSRtYWNyb2NhbGwkOFwiLCBcInN5bWJvbHNcIjogW1wiZDAxXzMwXCJdfSxcbiAgICB7XCJuYW1lXCI6IFwidWFfbW9udGhfZGF5JG1hY3JvY2FsbCQ3JGVibmYkMVwiLCBcInN5bWJvbHNcIjogW1wiVUFcIl0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJ1YV9tb250aF9kYXkkbWFjcm9jYWxsJDckZWJuZiQxXCIsIFwic3ltYm9sc1wiOiBbXSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbihkKSB7cmV0dXJuIG51bGw7fX0sXG4gICAge1wibmFtZVwiOiBcInVhX21vbnRoX2RheSRtYWNyb2NhbGwkNyRlYm5mJDJcIiwgXCJzeW1ib2xzXCI6IFtcIlVBXCJdLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwidWFfbW9udGhfZGF5JG1hY3JvY2FsbCQ3JGVibmYkMlwiLCBcInN5bWJvbHNcIjogW10sIFwicG9zdHByb2Nlc3NcIjogZnVuY3Rpb24oZCkge3JldHVybiBudWxsO319LFxuICAgIHtcIm5hbWVcIjogXCJ1YV9tb250aF9kYXkkbWFjcm9jYWxsJDdcIiwgXCJzeW1ib2xzXCI6IFtcInVhX21vbnRoX2RheSRtYWNyb2NhbGwkNyRlYm5mJDFcIiwgXCJ1YV9tb250aF9kYXkkbWFjcm9jYWxsJDhcIiwgXCJ1YV9tb250aF9kYXkkbWFjcm9jYWxsJDckZWJuZiQyXCJdfSxcbiAgICB7XCJuYW1lXCI6IFwidWFfbW9udGhfZGF5XCIsIFwic3ltYm9sc1wiOiBbXCJ1YV9tb250aF9kYXkkbWFjcm9jYWxsJDVcIiwge1wibGl0ZXJhbFwiOlwiLVwifSwgXCJ1YV9tb250aF9kYXkkbWFjcm9jYWxsJDdcIl0sIFwicG9zdHByb2Nlc3NcIjogcGx1Y2soMCwgMil9LFxuICAgIHtcIm5hbWVcIjogXCJ1YV9tb250aF9kYXkkbWFjcm9jYWxsJDEwJHN0cmluZyQxXCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiMFwifSwge1wibGl0ZXJhbFwiOlwiMlwifV0sIFwicG9zdHByb2Nlc3NcIjogZnVuY3Rpb24gam9pbmVyKGQpIHtyZXR1cm4gZC5qb2luKCcnKTt9fSxcbiAgICB7XCJuYW1lXCI6IFwidWFfbW9udGhfZGF5JG1hY3JvY2FsbCQxMFwiLCBcInN5bWJvbHNcIjogW1widWFfbW9udGhfZGF5JG1hY3JvY2FsbCQxMCRzdHJpbmckMVwiXX0sXG4gICAge1wibmFtZVwiOiBcInVhX21vbnRoX2RheSRtYWNyb2NhbGwkOSRlYm5mJDFcIiwgXCJzeW1ib2xzXCI6IFtcIlVBXCJdLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwidWFfbW9udGhfZGF5JG1hY3JvY2FsbCQ5JGVibmYkMVwiLCBcInN5bWJvbHNcIjogW10sIFwicG9zdHByb2Nlc3NcIjogZnVuY3Rpb24oZCkge3JldHVybiBudWxsO319LFxuICAgIHtcIm5hbWVcIjogXCJ1YV9tb250aF9kYXkkbWFjcm9jYWxsJDkkZWJuZiQyXCIsIFwic3ltYm9sc1wiOiBbXCJVQVwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH0sXG4gICAge1wibmFtZVwiOiBcInVhX21vbnRoX2RheSRtYWNyb2NhbGwkOSRlYm5mJDJcIiwgXCJzeW1ib2xzXCI6IFtdLCBcInBvc3Rwcm9jZXNzXCI6IGZ1bmN0aW9uKGQpIHtyZXR1cm4gbnVsbDt9fSxcbiAgICB7XCJuYW1lXCI6IFwidWFfbW9udGhfZGF5JG1hY3JvY2FsbCQ5XCIsIFwic3ltYm9sc1wiOiBbXCJ1YV9tb250aF9kYXkkbWFjcm9jYWxsJDkkZWJuZiQxXCIsIFwidWFfbW9udGhfZGF5JG1hY3JvY2FsbCQxMFwiLCBcInVhX21vbnRoX2RheSRtYWNyb2NhbGwkOSRlYm5mJDJcIl19LFxuICAgIHtcIm5hbWVcIjogXCJ1YV9tb250aF9kYXkkbWFjcm9jYWxsJDEyXCIsIFwic3ltYm9sc1wiOiBbXCJkMDFfMjlcIl19LFxuICAgIHtcIm5hbWVcIjogXCJ1YV9tb250aF9kYXkkbWFjcm9jYWxsJDExJGVibmYkMVwiLCBcInN5bWJvbHNcIjogW1wiVUFcIl0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJ1YV9tb250aF9kYXkkbWFjcm9jYWxsJDExJGVibmYkMVwiLCBcInN5bWJvbHNcIjogW10sIFwicG9zdHByb2Nlc3NcIjogZnVuY3Rpb24oZCkge3JldHVybiBudWxsO319LFxuICAgIHtcIm5hbWVcIjogXCJ1YV9tb250aF9kYXkkbWFjcm9jYWxsJDExJGVibmYkMlwiLCBcInN5bWJvbHNcIjogW1wiVUFcIl0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJ1YV9tb250aF9kYXkkbWFjcm9jYWxsJDExJGVibmYkMlwiLCBcInN5bWJvbHNcIjogW10sIFwicG9zdHByb2Nlc3NcIjogZnVuY3Rpb24oZCkge3JldHVybiBudWxsO319LFxuICAgIHtcIm5hbWVcIjogXCJ1YV9tb250aF9kYXkkbWFjcm9jYWxsJDExXCIsIFwic3ltYm9sc1wiOiBbXCJ1YV9tb250aF9kYXkkbWFjcm9jYWxsJDExJGVibmYkMVwiLCBcInVhX21vbnRoX2RheSRtYWNyb2NhbGwkMTJcIiwgXCJ1YV9tb250aF9kYXkkbWFjcm9jYWxsJDExJGVibmYkMlwiXX0sXG4gICAge1wibmFtZVwiOiBcInVhX21vbnRoX2RheVwiLCBcInN5bWJvbHNcIjogW1widWFfbW9udGhfZGF5JG1hY3JvY2FsbCQ5XCIsIHtcImxpdGVyYWxcIjpcIi1cIn0sIFwidWFfbW9udGhfZGF5JG1hY3JvY2FsbCQxMVwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBwbHVjaygwLCAyKX0sXG4gICAge1wibmFtZVwiOiBcIkwyWFwiLCBcInN5bWJvbHNcIjogW1wiZHg0XCJdLCBcInBvc3Rwcm9jZXNzXCI6IG1hc2tlZCgpfSxcbiAgICB7XCJuYW1lXCI6IFwiTDJYXCIsIFwic3ltYm9sc1wiOiBbXCJkeDRcIiwge1wibGl0ZXJhbFwiOlwiLVwifSwgXCJteFwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBtYXNrZWQoKX0sXG4gICAge1wibmFtZVwiOiBcIkwyWFwiLCBcInN5bWJvbHNcIjogW1wiZHg0XCIsIHtcImxpdGVyYWxcIjpcIi1cIn0sIFwibWR4XCJdLCBcInBvc3Rwcm9jZXNzXCI6IG1hc2tlZCgpfSxcbiAgICB7XCJuYW1lXCI6IFwibWR4XCIsIFwic3ltYm9sc1wiOiBbXCJtMzF4XCIsIHtcImxpdGVyYWxcIjpcIi1cIn0sIFwiZDMxeFwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBqb2lufSxcbiAgICB7XCJuYW1lXCI6IFwibWR4XCIsIFwic3ltYm9sc1wiOiBbXCJtMzB4XCIsIHtcImxpdGVyYWxcIjpcIi1cIn0sIFwiZDMweFwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBqb2lufSxcbiAgICB7XCJuYW1lXCI6IFwibWR4JHN0cmluZyQxXCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiMFwifSwge1wibGl0ZXJhbFwiOlwiMlwifSwge1wibGl0ZXJhbFwiOlwiLVwifV0sIFwicG9zdHByb2Nlc3NcIjogZnVuY3Rpb24gam9pbmVyKGQpIHtyZXR1cm4gZC5qb2luKCcnKTt9fSxcbiAgICB7XCJuYW1lXCI6IFwibWR4XCIsIFwic3ltYm9sc1wiOiBbXCJtZHgkc3RyaW5nJDFcIiwgXCJkMjl4XCJdLCBcInBvc3Rwcm9jZXNzXCI6IGpvaW59LFxuICAgIHtcIm5hbWVcIjogXCJMMmlcIiwgXCJzeW1ib2xzXCI6IFtcIkwyaV9kYXRlXCIsIHtcImxpdGVyYWxcIjpcIi9cIn0sIFwiTDJpX2RhdGVcIl0sIFwicG9zdHByb2Nlc3NcIjogaW50ZXJ2YWwoMil9LFxuICAgIHtcIm5hbWVcIjogXCJMMmlcIiwgXCJzeW1ib2xzXCI6IFtcImRhdGVfdGltZVwiLCB7XCJsaXRlcmFsXCI6XCIvXCJ9LCBcIkwyaV9kYXRlXCJdLCBcInBvc3Rwcm9jZXNzXCI6IGludGVydmFsKDIpfSxcbiAgICB7XCJuYW1lXCI6IFwiTDJpXCIsIFwic3ltYm9sc1wiOiBbXCJMMmlfZGF0ZVwiLCB7XCJsaXRlcmFsXCI6XCIvXCJ9LCBcImRhdGVfdGltZVwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBpbnRlcnZhbCgyKX0sXG4gICAge1wibmFtZVwiOiBcIkwyaV9kYXRlXCIsIFwic3ltYm9sc1wiOiBbXSwgXCJwb3N0cHJvY2Vzc1wiOiBub3RoaW5nfSxcbiAgICB7XCJuYW1lXCI6IFwiTDJpX2RhdGVcIiwgXCJzeW1ib2xzXCI6IFtcInVhX2RhdGVcIl0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJMMmlfZGF0ZVwiLCBcInN5bWJvbHNcIjogW1wiTDJYXCJdLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwiTDJpX2RhdGVcIiwgXCJzeW1ib2xzXCI6IFtcIklORklOSVRZXCJdLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwiTDJZXCIsIFwic3ltYm9sc1wiOiBbXCJleHBfeWVhclwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH0sXG4gICAge1wibmFtZVwiOiBcIkwyWVwiLCBcInN5bWJvbHNcIjogW1wiZXhwX3llYXJcIiwgXCJzaWduaWZpY2FudF9kaWdpdHNcIl0sIFwicG9zdHByb2Nlc3NcIjogbWVyZ2UoMCwgMSl9LFxuICAgIHtcIm5hbWVcIjogXCJMMllcIiwgXCJzeW1ib2xzXCI6IFtcIkwxWVwiLCBcInNpZ25pZmljYW50X2RpZ2l0c1wiXSwgXCJwb3N0cHJvY2Vzc1wiOiBtZXJnZSgwLCAxLCB7IGxldmVsOiAyIH0pfSxcbiAgICB7XCJuYW1lXCI6IFwiTDJZXCIsIFwic3ltYm9sc1wiOiBbXCJ5ZWFyXCIsIFwic2lnbmlmaWNhbnRfZGlnaXRzXCJdLCBcInBvc3Rwcm9jZXNzXCI6IGRhdGEgPT4geWVhcihbZGF0YVswXV0sIDIsIGRhdGFbMV0pfSxcbiAgICB7XCJuYW1lXCI6IFwic2lnbmlmaWNhbnRfZGlnaXRzXCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiU1wifSwgXCJwb3NpdGl2ZV9kaWdpdFwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBkYXRhID0+ICh7IHNpZ25pZmljYW50OiBudW0oZGF0YVsxXSkgfSl9LFxuICAgIHtcIm5hbWVcIjogXCJleHBfeWVhclwiLCBcInN5bWJvbHNcIjogW3tcImxpdGVyYWxcIjpcIllcIn0sIFwiZXhwXCJdLCBcInBvc3Rwcm9jZXNzXCI6IGRhdGEgPT4geWVhcihbZGF0YVsxXV0sIDIpfSxcbiAgICB7XCJuYW1lXCI6IFwiZXhwX3llYXIkc3RyaW5nJDFcIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCJZXCJ9LCB7XCJsaXRlcmFsXCI6XCItXCJ9XSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbiBqb2luZXIoZCkge3JldHVybiBkLmpvaW4oJycpO319LFxuICAgIHtcIm5hbWVcIjogXCJleHBfeWVhclwiLCBcInN5bWJvbHNcIjogW1wiZXhwX3llYXIkc3RyaW5nJDFcIiwgXCJleHBcIl0sIFwicG9zdHByb2Nlc3NcIjogZGF0YSA9PiB5ZWFyKFstZGF0YVsxXV0sIDIpfSxcbiAgICB7XCJuYW1lXCI6IFwiZXhwXCIsIFwic3ltYm9sc1wiOiBbXCJkaWdpdHNcIiwge1wibGl0ZXJhbFwiOlwiRVwifSwgXCJkaWdpdHNcIl0sIFwicG9zdHByb2Nlc3NcIjogZGF0YSA9PiBudW0oZGF0YVswXSkgKiBNYXRoLnBvdygxMCwgbnVtKGRhdGFbMl0pKX0sXG4gICAge1wibmFtZVwiOiBcIkwyU1wiLCBcInN5bWJvbHNcIjogW1wieWVhclwiLCB7XCJsaXRlcmFsXCI6XCItXCJ9LCBcImQyNV80MVwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBkYXRhID0+IHNlYXNvbihkYXRhLCAyKX0sXG4gICAge1wibmFtZVwiOiBcImRlY2FkZVwiLCBcInN5bWJvbHNcIjogW1wicG9zaXRpdmVfZGVjYWRlXCJdLCBcInBvc3Rwcm9jZXNzXCI6IGRhdGEgPT4gZGVjYWRlKGRhdGFbMF0pfSxcbiAgICB7XCJuYW1lXCI6IFwiZGVjYWRlJHN0cmluZyQxXCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiMFwifSwge1wibGl0ZXJhbFwiOlwiMFwifSwge1wibGl0ZXJhbFwiOlwiMFwifV0sIFwicG9zdHByb2Nlc3NcIjogZnVuY3Rpb24gam9pbmVyKGQpIHtyZXR1cm4gZC5qb2luKCcnKTt9fSxcbiAgICB7XCJuYW1lXCI6IFwiZGVjYWRlXCIsIFwic3ltYm9sc1wiOiBbXCJkZWNhZGUkc3RyaW5nJDFcIl0sIFwicG9zdHByb2Nlc3NcIjogKCkgPT4gZGVjYWRlKDApfSxcbiAgICB7XCJuYW1lXCI6IFwiZGVjYWRlXCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiLVwifSwgXCJwb3NpdGl2ZV9kZWNhZGVcIl0sIFwicG9zdHByb2Nlc3NcIjogZGF0YSA9PiBkZWNhZGUoLWRhdGFbMV0pfSxcbiAgICB7XCJuYW1lXCI6IFwicG9zaXRpdmVfZGVjYWRlXCIsIFwic3ltYm9sc1wiOiBbXCJwb3NpdGl2ZV9kaWdpdFwiLCBcImRpZ2l0XCIsIFwiZGlnaXRcIl0sIFwicG9zdHByb2Nlc3NcIjogbnVtfSxcbiAgICB7XCJuYW1lXCI6IFwicG9zaXRpdmVfZGVjYWRlXCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiMFwifSwgXCJwb3NpdGl2ZV9kaWdpdFwiLCBcImRpZ2l0XCJdLCBcInBvc3Rwcm9jZXNzXCI6IG51bX0sXG4gICAge1wibmFtZVwiOiBcInBvc2l0aXZlX2RlY2FkZSRzdHJpbmckMVwiLCBcInN5bWJvbHNcIjogW3tcImxpdGVyYWxcIjpcIjBcIn0sIHtcImxpdGVyYWxcIjpcIjBcIn1dLCBcInBvc3Rwcm9jZXNzXCI6IGZ1bmN0aW9uIGpvaW5lcihkKSB7cmV0dXJuIGQuam9pbignJyk7fX0sXG4gICAge1wibmFtZVwiOiBcInBvc2l0aXZlX2RlY2FkZVwiLCBcInN5bWJvbHNcIjogW1wicG9zaXRpdmVfZGVjYWRlJHN0cmluZyQxXCIsIFwicG9zaXRpdmVfZGlnaXRcIl0sIFwicG9zdHByb2Nlc3NcIjogbnVtfSxcbiAgICB7XCJuYW1lXCI6IFwic2V0XCIsIFwic3ltYm9sc1wiOiBbXCJMU0JcIiwgXCJPTFwiLCBcIlJTQlwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBsaXN0fSxcbiAgICB7XCJuYW1lXCI6IFwibGlzdFwiLCBcInN5bWJvbHNcIjogW1wiTExCXCIsIFwiT0xcIiwgXCJSTEJcIl0sIFwicG9zdHByb2Nlc3NcIjogbGlzdH0sXG4gICAge1wibmFtZVwiOiBcIkxTQlwiLCBcInN5bWJvbHNcIjogW3tcImxpdGVyYWxcIjpcIltcIn1dLCBcInBvc3Rwcm9jZXNzXCI6ICgpID0+ICh7IHR5cGU6ICdTZXQnIH0pfSxcbiAgICB7XCJuYW1lXCI6IFwiTFNCJHN0cmluZyQxXCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiW1wifSwge1wibGl0ZXJhbFwiOlwiLlwifSwge1wibGl0ZXJhbFwiOlwiLlwifV0sIFwicG9zdHByb2Nlc3NcIjogZnVuY3Rpb24gam9pbmVyKGQpIHtyZXR1cm4gZC5qb2luKCcnKTt9fSxcbiAgICB7XCJuYW1lXCI6IFwiTFNCXCIsIFwic3ltYm9sc1wiOiBbXCJMU0Ikc3RyaW5nJDFcIl0sIFwicG9zdHByb2Nlc3NcIjogKCkgPT4gKHsgdHlwZTogJ1NldCcsIGVhcmxpZXI6IHRydWUgfSl9LFxuICAgIHtcIm5hbWVcIjogXCJMTEJcIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCJ7XCJ9XSwgXCJwb3N0cHJvY2Vzc1wiOiAoKSA9PiAoeyB0eXBlOiAnTGlzdCcgfSl9LFxuICAgIHtcIm5hbWVcIjogXCJMTEIkc3RyaW5nJDFcIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCJ7XCJ9LCB7XCJsaXRlcmFsXCI6XCIuXCJ9LCB7XCJsaXRlcmFsXCI6XCIuXCJ9XSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbiBqb2luZXIoZCkge3JldHVybiBkLmpvaW4oJycpO319LFxuICAgIHtcIm5hbWVcIjogXCJMTEJcIiwgXCJzeW1ib2xzXCI6IFtcIkxMQiRzdHJpbmckMVwiXSwgXCJwb3N0cHJvY2Vzc1wiOiAoKSA9PiAoeyB0eXBlOiAnTGlzdCcsIGVhcmxpZXI6IHRydWUgfSl9LFxuICAgIHtcIm5hbWVcIjogXCJSU0JcIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCJdXCJ9XSwgXCJwb3N0cHJvY2Vzc1wiOiBub3RoaW5nfSxcbiAgICB7XCJuYW1lXCI6IFwiUlNCJHN0cmluZyQxXCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiLlwifSwge1wibGl0ZXJhbFwiOlwiLlwifSwge1wibGl0ZXJhbFwiOlwiXVwifV0sIFwicG9zdHByb2Nlc3NcIjogZnVuY3Rpb24gam9pbmVyKGQpIHtyZXR1cm4gZC5qb2luKCcnKTt9fSxcbiAgICB7XCJuYW1lXCI6IFwiUlNCXCIsIFwic3ltYm9sc1wiOiBbXCJSU0Ikc3RyaW5nJDFcIl0sIFwicG9zdHByb2Nlc3NcIjogKCkgPT4gKHsgbGF0ZXI6IHRydWUgfSl9LFxuICAgIHtcIm5hbWVcIjogXCJSTEJcIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCJ9XCJ9XSwgXCJwb3N0cHJvY2Vzc1wiOiBub3RoaW5nfSxcbiAgICB7XCJuYW1lXCI6IFwiUkxCJHN0cmluZyQxXCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiLlwifSwge1wibGl0ZXJhbFwiOlwiLlwifSwge1wibGl0ZXJhbFwiOlwifVwifV0sIFwicG9zdHByb2Nlc3NcIjogZnVuY3Rpb24gam9pbmVyKGQpIHtyZXR1cm4gZC5qb2luKCcnKTt9fSxcbiAgICB7XCJuYW1lXCI6IFwiUkxCXCIsIFwic3ltYm9sc1wiOiBbXCJSTEIkc3RyaW5nJDFcIl0sIFwicG9zdHByb2Nlc3NcIjogKCkgPT4gKHsgbGF0ZXI6IHRydWUgfSl9LFxuICAgIHtcIm5hbWVcIjogXCJPTFwiLCBcInN5bWJvbHNcIjogW1wiTElcIl0sIFwicG9zdHByb2Nlc3NcIjogZGF0YSA9PiBbZGF0YVswXV19LFxuICAgIHtcIm5hbWVcIjogXCJPTFwiLCBcInN5bWJvbHNcIjogW1wiT0xcIiwgXCJfXCIsIHtcImxpdGVyYWxcIjpcIixcIn0sIFwiX1wiLCBcIkxJXCJdLCBcInBvc3Rwcm9jZXNzXCI6IGRhdGEgPT4gWy4uLmRhdGFbMF0sIGRhdGFbNF1dfSxcbiAgICB7XCJuYW1lXCI6IFwiTElcIiwgXCJzeW1ib2xzXCI6IFtcImRhdGVcIl0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJMSVwiLCBcInN5bWJvbHNcIjogW1widWFfZGF0ZVwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH0sXG4gICAge1wibmFtZVwiOiBcIkxJXCIsIFwic3ltYm9sc1wiOiBbXCJMMlhcIl0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJMSVwiLCBcInN5bWJvbHNcIjogW1wiY29uc2VjdXRpdmVzXCJdLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwiY29uc2VjdXRpdmVzJHN0cmluZyQxXCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiLlwifSwge1wibGl0ZXJhbFwiOlwiLlwifV0sIFwicG9zdHByb2Nlc3NcIjogZnVuY3Rpb24gam9pbmVyKGQpIHtyZXR1cm4gZC5qb2luKCcnKTt9fSxcbiAgICB7XCJuYW1lXCI6IFwiY29uc2VjdXRpdmVzXCIsIFwic3ltYm9sc1wiOiBbXCJ5ZWFyX21vbnRoX2RheVwiLCBcImNvbnNlY3V0aXZlcyRzdHJpbmckMVwiLCBcInllYXJfbW9udGhfZGF5XCJdLCBcInBvc3Rwcm9jZXNzXCI6IGQgPT4gW2RhdGUoZFswXSksIGRhdGUoZFsyXSldfSxcbiAgICB7XCJuYW1lXCI6IFwiY29uc2VjdXRpdmVzJHN0cmluZyQyXCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiLlwifSwge1wibGl0ZXJhbFwiOlwiLlwifV0sIFwicG9zdHByb2Nlc3NcIjogZnVuY3Rpb24gam9pbmVyKGQpIHtyZXR1cm4gZC5qb2luKCcnKTt9fSxcbiAgICB7XCJuYW1lXCI6IFwiY29uc2VjdXRpdmVzXCIsIFwic3ltYm9sc1wiOiBbXCJ5ZWFyX21vbnRoXCIsIFwiY29uc2VjdXRpdmVzJHN0cmluZyQyXCIsIFwieWVhcl9tb250aFwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBkID0+IFtkYXRlKGRbMF0pLCBkYXRlKGRbMl0pXX0sXG4gICAge1wibmFtZVwiOiBcImNvbnNlY3V0aXZlcyRzdHJpbmckM1wiLCBcInN5bWJvbHNcIjogW3tcImxpdGVyYWxcIjpcIi5cIn0sIHtcImxpdGVyYWxcIjpcIi5cIn1dLCBcInBvc3Rwcm9jZXNzXCI6IGZ1bmN0aW9uIGpvaW5lcihkKSB7cmV0dXJuIGQuam9pbignJyk7fX0sXG4gICAge1wibmFtZVwiOiBcImNvbnNlY3V0aXZlc1wiLCBcInN5bWJvbHNcIjogW1wieWVhclwiLCBcImNvbnNlY3V0aXZlcyRzdHJpbmckM1wiLCBcInllYXJcIl0sIFwicG9zdHByb2Nlc3NcIjogZCA9PiBbZGF0ZShbZFswXV0pLCBkYXRlKFtkWzJdXSldfSxcbiAgICB7XCJuYW1lXCI6IFwiTDNcIiwgXCJzeW1ib2xzXCI6IFtcIkwzaVwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH0sXG4gICAge1wibmFtZVwiOiBcIkwzaVwiLCBcInN5bWJvbHNcIjogW1wiTDNTXCIsIHtcImxpdGVyYWxcIjpcIi9cIn0sIFwiTDNTXCJdLCBcInBvc3Rwcm9jZXNzXCI6IGludGVydmFsKDMpfSxcbiAgICB7XCJuYW1lXCI6IFwiTDNTXCIsIFwic3ltYm9sc1wiOiBbXCJMMVNcIl0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJMM1NcIiwgXCJzeW1ib2xzXCI6IFtcIkwyU1wiXSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH0sXG4gICAge1wibmFtZVwiOiBcImRpZ2l0XCIsIFwic3ltYm9sc1wiOiBbXCJwb3NpdGl2ZV9kaWdpdFwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH0sXG4gICAge1wibmFtZVwiOiBcImRpZ2l0XCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiMFwifV0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJkaWdpdHNcIiwgXCJzeW1ib2xzXCI6IFtcImRpZ2l0XCJdLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwiZGlnaXRzXCIsIFwic3ltYm9sc1wiOiBbXCJkaWdpdHNcIiwgXCJkaWdpdFwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBqb2lufSxcbiAgICB7XCJuYW1lXCI6IFwibmQ0XCIsIFwic3ltYm9sc1wiOiBbXCJkNFwiXX0sXG4gICAge1wibmFtZVwiOiBcIm5kNFwiLCBcInN5bWJvbHNcIjogW3tcImxpdGVyYWxcIjpcIi1cIn0sIFwiZDRcIl0sIFwicG9zdHByb2Nlc3NcIjogam9pbn0sXG4gICAge1wibmFtZVwiOiBcIm5kM1wiLCBcInN5bWJvbHNcIjogW1wiZDNcIl19LFxuICAgIHtcIm5hbWVcIjogXCJuZDNcIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCItXCJ9LCBcImQzXCJdLCBcInBvc3Rwcm9jZXNzXCI6IGpvaW59LFxuICAgIHtcIm5hbWVcIjogXCJuZDJcIiwgXCJzeW1ib2xzXCI6IFtcImQyXCJdfSxcbiAgICB7XCJuYW1lXCI6IFwibmQyXCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiLVwifSwgXCJkMlwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBqb2lufSxcbiAgICB7XCJuYW1lXCI6IFwiZDRcIiwgXCJzeW1ib2xzXCI6IFtcImQyXCIsIFwiZDJcIl0sIFwicG9zdHByb2Nlc3NcIjogam9pbn0sXG4gICAge1wibmFtZVwiOiBcImQzXCIsIFwic3ltYm9sc1wiOiBbXCJkMlwiLCBcImRpZ2l0XCJdLCBcInBvc3Rwcm9jZXNzXCI6IGpvaW59LFxuICAgIHtcIm5hbWVcIjogXCJkMlwiLCBcInN5bWJvbHNcIjogW1wiZGlnaXRcIiwgXCJkaWdpdFwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBqb2lufSxcbiAgICB7XCJuYW1lXCI6IFwiZDUrXCIsIFwic3ltYm9sc1wiOiBbXCJwb3NpdGl2ZV9kaWdpdFwiLCBcImQzXCIsIFwiZGlnaXRzXCJdLCBcInBvc3Rwcm9jZXNzXCI6IG51bX0sXG4gICAge1wibmFtZVwiOiBcImQxeFwiLCBcInN5bWJvbHNcIjogWy9bMS05WF0vXSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH0sXG4gICAge1wibmFtZVwiOiBcImR4XCIsIFwic3ltYm9sc1wiOiBbXCJkMXhcIl0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJkeFwiLCBcInN5bWJvbHNcIjogW3tcImxpdGVyYWxcIjpcIjBcIn1dLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwiZHgyXCIsIFwic3ltYm9sc1wiOiBbXCJkeFwiLCBcImR4XCJdLCBcInBvc3Rwcm9jZXNzXCI6IGpvaW59LFxuICAgIHtcIm5hbWVcIjogXCJkeDRcIiwgXCJzeW1ib2xzXCI6IFtcImR4MlwiLCBcImR4MlwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBqb2lufSxcbiAgICB7XCJuYW1lXCI6IFwiZHg0XCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiLVwifSwgXCJkeDJcIiwgXCJkeDJcIl0sIFwicG9zdHByb2Nlc3NcIjogam9pbn0sXG4gICAge1wibmFtZVwiOiBcIm1kXCIsIFwic3ltYm9sc1wiOiBbXCJtMzFcIl0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJtZFwiLCBcInN5bWJvbHNcIjogW1wibTMwXCJdLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwibWQkc3RyaW5nJDFcIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCIwXCJ9LCB7XCJsaXRlcmFsXCI6XCIyXCJ9XSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbiBqb2luZXIoZCkge3JldHVybiBkLmpvaW4oJycpO319LFxuICAgIHtcIm5hbWVcIjogXCJtZFwiLCBcInN5bWJvbHNcIjogW1wibWQkc3RyaW5nJDFcIl0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJteFwiLCBcInN5bWJvbHNcIjogW3tcImxpdGVyYWxcIjpcIjBcIn0sIFwiZDF4XCJdLCBcInBvc3Rwcm9jZXNzXCI6IGpvaW59LFxuICAgIHtcIm5hbWVcIjogXCJteFwiLCBcInN5bWJvbHNcIjogWy9bMVhdLywgL1swMTJYXS9dLCBcInBvc3Rwcm9jZXNzXCI6IGpvaW59LFxuICAgIHtcIm5hbWVcIjogXCJtMzF4XCIsIFwic3ltYm9sc1wiOiBbL1swWF0vLCAvWzEzNTc4WF0vXSwgXCJwb3N0cHJvY2Vzc1wiOiBqb2lufSxcbiAgICB7XCJuYW1lXCI6IFwibTMxeFwiLCBcInN5bWJvbHNcIjogWy9bMVhdLywgL1swMl0vXSwgXCJwb3N0cHJvY2Vzc1wiOiBqb2lufSxcbiAgICB7XCJuYW1lXCI6IFwibTMxeCRzdHJpbmckMVwiLCBcInN5bWJvbHNcIjogW3tcImxpdGVyYWxcIjpcIjFcIn0sIHtcImxpdGVyYWxcIjpcIlhcIn1dLCBcInBvc3Rwcm9jZXNzXCI6IGZ1bmN0aW9uIGpvaW5lcihkKSB7cmV0dXJuIGQuam9pbignJyk7fX0sXG4gICAge1wibmFtZVwiOiBcIm0zMXhcIiwgXCJzeW1ib2xzXCI6IFtcIm0zMXgkc3RyaW5nJDFcIl0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJtMzB4XCIsIFwic3ltYm9sc1wiOiBbL1swWF0vLCAvWzQ2OV0vXSwgXCJwb3N0cHJvY2Vzc1wiOiBqb2lufSxcbiAgICB7XCJuYW1lXCI6IFwibTMweCRzdHJpbmckMVwiLCBcInN5bWJvbHNcIjogW3tcImxpdGVyYWxcIjpcIjFcIn0sIHtcImxpdGVyYWxcIjpcIjFcIn1dLCBcInBvc3Rwcm9jZXNzXCI6IGZ1bmN0aW9uIGpvaW5lcihkKSB7cmV0dXJuIGQuam9pbignJyk7fX0sXG4gICAge1wibmFtZVwiOiBcIm0zMHhcIiwgXCJzeW1ib2xzXCI6IFtcIm0zMHgkc3RyaW5nJDFcIl0sIFwicG9zdHByb2Nlc3NcIjogam9pbn0sXG4gICAge1wibmFtZVwiOiBcImQyOXhcIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCIwXCJ9LCBcImQxeFwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBqb2lufSxcbiAgICB7XCJuYW1lXCI6IFwiZDI5eFwiLCBcInN5bWJvbHNcIjogWy9bMS0yWF0vLCBcImR4XCJdLCBcInBvc3Rwcm9jZXNzXCI6IGpvaW59LFxuICAgIHtcIm5hbWVcIjogXCJkMzB4XCIsIFwic3ltYm9sc1wiOiBbXCJkMjl4XCJdLCBcInBvc3Rwcm9jZXNzXCI6IGpvaW59LFxuICAgIHtcIm5hbWVcIjogXCJkMzB4JHN0cmluZyQxXCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiM1wifSwge1wibGl0ZXJhbFwiOlwiMFwifV0sIFwicG9zdHByb2Nlc3NcIjogZnVuY3Rpb24gam9pbmVyKGQpIHtyZXR1cm4gZC5qb2luKCcnKTt9fSxcbiAgICB7XCJuYW1lXCI6IFwiZDMweFwiLCBcInN5bWJvbHNcIjogW1wiZDMweCRzdHJpbmckMVwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH0sXG4gICAge1wibmFtZVwiOiBcImQzMXhcIiwgXCJzeW1ib2xzXCI6IFtcImQzMHhcIl0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJkMzF4XCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiM1wifSwgL1sxWF0vXSwgXCJwb3N0cHJvY2Vzc1wiOiBqb2lufSxcbiAgICB7XCJuYW1lXCI6IFwicG9zaXRpdmVfZGlnaXRcIiwgXCJzeW1ib2xzXCI6IFsvWzEtOV0vXSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH0sXG4gICAge1wibmFtZVwiOiBcIm0zMSRzdWJleHByZXNzaW9uJDEkc3RyaW5nJDFcIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCIwXCJ9LCB7XCJsaXRlcmFsXCI6XCIxXCJ9XSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbiBqb2luZXIoZCkge3JldHVybiBkLmpvaW4oJycpO319LFxuICAgIHtcIm5hbWVcIjogXCJtMzEkc3ViZXhwcmVzc2lvbiQxXCIsIFwic3ltYm9sc1wiOiBbXCJtMzEkc3ViZXhwcmVzc2lvbiQxJHN0cmluZyQxXCJdfSxcbiAgICB7XCJuYW1lXCI6IFwibTMxJHN1YmV4cHJlc3Npb24kMSRzdHJpbmckMlwiLCBcInN5bWJvbHNcIjogW3tcImxpdGVyYWxcIjpcIjBcIn0sIHtcImxpdGVyYWxcIjpcIjNcIn1dLCBcInBvc3Rwcm9jZXNzXCI6IGZ1bmN0aW9uIGpvaW5lcihkKSB7cmV0dXJuIGQuam9pbignJyk7fX0sXG4gICAge1wibmFtZVwiOiBcIm0zMSRzdWJleHByZXNzaW9uJDFcIiwgXCJzeW1ib2xzXCI6IFtcIm0zMSRzdWJleHByZXNzaW9uJDEkc3RyaW5nJDJcIl19LFxuICAgIHtcIm5hbWVcIjogXCJtMzEkc3ViZXhwcmVzc2lvbiQxJHN0cmluZyQzXCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiMFwifSwge1wibGl0ZXJhbFwiOlwiNVwifV0sIFwicG9zdHByb2Nlc3NcIjogZnVuY3Rpb24gam9pbmVyKGQpIHtyZXR1cm4gZC5qb2luKCcnKTt9fSxcbiAgICB7XCJuYW1lXCI6IFwibTMxJHN1YmV4cHJlc3Npb24kMVwiLCBcInN5bWJvbHNcIjogW1wibTMxJHN1YmV4cHJlc3Npb24kMSRzdHJpbmckM1wiXX0sXG4gICAge1wibmFtZVwiOiBcIm0zMSRzdWJleHByZXNzaW9uJDEkc3RyaW5nJDRcIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCIwXCJ9LCB7XCJsaXRlcmFsXCI6XCI3XCJ9XSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbiBqb2luZXIoZCkge3JldHVybiBkLmpvaW4oJycpO319LFxuICAgIHtcIm5hbWVcIjogXCJtMzEkc3ViZXhwcmVzc2lvbiQxXCIsIFwic3ltYm9sc1wiOiBbXCJtMzEkc3ViZXhwcmVzc2lvbiQxJHN0cmluZyQ0XCJdfSxcbiAgICB7XCJuYW1lXCI6IFwibTMxJHN1YmV4cHJlc3Npb24kMSRzdHJpbmckNVwiLCBcInN5bWJvbHNcIjogW3tcImxpdGVyYWxcIjpcIjBcIn0sIHtcImxpdGVyYWxcIjpcIjhcIn1dLCBcInBvc3Rwcm9jZXNzXCI6IGZ1bmN0aW9uIGpvaW5lcihkKSB7cmV0dXJuIGQuam9pbignJyk7fX0sXG4gICAge1wibmFtZVwiOiBcIm0zMSRzdWJleHByZXNzaW9uJDFcIiwgXCJzeW1ib2xzXCI6IFtcIm0zMSRzdWJleHByZXNzaW9uJDEkc3RyaW5nJDVcIl19LFxuICAgIHtcIm5hbWVcIjogXCJtMzEkc3ViZXhwcmVzc2lvbiQxJHN0cmluZyQ2XCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiMVwifSwge1wibGl0ZXJhbFwiOlwiMFwifV0sIFwicG9zdHByb2Nlc3NcIjogZnVuY3Rpb24gam9pbmVyKGQpIHtyZXR1cm4gZC5qb2luKCcnKTt9fSxcbiAgICB7XCJuYW1lXCI6IFwibTMxJHN1YmV4cHJlc3Npb24kMVwiLCBcInN5bWJvbHNcIjogW1wibTMxJHN1YmV4cHJlc3Npb24kMSRzdHJpbmckNlwiXX0sXG4gICAge1wibmFtZVwiOiBcIm0zMSRzdWJleHByZXNzaW9uJDEkc3RyaW5nJDdcIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCIxXCJ9LCB7XCJsaXRlcmFsXCI6XCIyXCJ9XSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbiBqb2luZXIoZCkge3JldHVybiBkLmpvaW4oJycpO319LFxuICAgIHtcIm5hbWVcIjogXCJtMzEkc3ViZXhwcmVzc2lvbiQxXCIsIFwic3ltYm9sc1wiOiBbXCJtMzEkc3ViZXhwcmVzc2lvbiQxJHN0cmluZyQ3XCJdfSxcbiAgICB7XCJuYW1lXCI6IFwibTMxXCIsIFwic3ltYm9sc1wiOiBbXCJtMzEkc3ViZXhwcmVzc2lvbiQxXCJdLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwibTMwJHN1YmV4cHJlc3Npb24kMSRzdHJpbmckMVwiLCBcInN5bWJvbHNcIjogW3tcImxpdGVyYWxcIjpcIjBcIn0sIHtcImxpdGVyYWxcIjpcIjRcIn1dLCBcInBvc3Rwcm9jZXNzXCI6IGZ1bmN0aW9uIGpvaW5lcihkKSB7cmV0dXJuIGQuam9pbignJyk7fX0sXG4gICAge1wibmFtZVwiOiBcIm0zMCRzdWJleHByZXNzaW9uJDFcIiwgXCJzeW1ib2xzXCI6IFtcIm0zMCRzdWJleHByZXNzaW9uJDEkc3RyaW5nJDFcIl19LFxuICAgIHtcIm5hbWVcIjogXCJtMzAkc3ViZXhwcmVzc2lvbiQxJHN0cmluZyQyXCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiMFwifSwge1wibGl0ZXJhbFwiOlwiNlwifV0sIFwicG9zdHByb2Nlc3NcIjogZnVuY3Rpb24gam9pbmVyKGQpIHtyZXR1cm4gZC5qb2luKCcnKTt9fSxcbiAgICB7XCJuYW1lXCI6IFwibTMwJHN1YmV4cHJlc3Npb24kMVwiLCBcInN5bWJvbHNcIjogW1wibTMwJHN1YmV4cHJlc3Npb24kMSRzdHJpbmckMlwiXX0sXG4gICAge1wibmFtZVwiOiBcIm0zMCRzdWJleHByZXNzaW9uJDEkc3RyaW5nJDNcIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCIwXCJ9LCB7XCJsaXRlcmFsXCI6XCI5XCJ9XSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbiBqb2luZXIoZCkge3JldHVybiBkLmpvaW4oJycpO319LFxuICAgIHtcIm5hbWVcIjogXCJtMzAkc3ViZXhwcmVzc2lvbiQxXCIsIFwic3ltYm9sc1wiOiBbXCJtMzAkc3ViZXhwcmVzc2lvbiQxJHN0cmluZyQzXCJdfSxcbiAgICB7XCJuYW1lXCI6IFwibTMwJHN1YmV4cHJlc3Npb24kMSRzdHJpbmckNFwiLCBcInN5bWJvbHNcIjogW3tcImxpdGVyYWxcIjpcIjFcIn0sIHtcImxpdGVyYWxcIjpcIjFcIn1dLCBcInBvc3Rwcm9jZXNzXCI6IGZ1bmN0aW9uIGpvaW5lcihkKSB7cmV0dXJuIGQuam9pbignJyk7fX0sXG4gICAge1wibmFtZVwiOiBcIm0zMCRzdWJleHByZXNzaW9uJDFcIiwgXCJzeW1ib2xzXCI6IFtcIm0zMCRzdWJleHByZXNzaW9uJDEkc3RyaW5nJDRcIl19LFxuICAgIHtcIm5hbWVcIjogXCJtMzBcIiwgXCJzeW1ib2xzXCI6IFtcIm0zMCRzdWJleHByZXNzaW9uJDFcIl0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJkMDFfMTFcIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCIwXCJ9LCBcInBvc2l0aXZlX2RpZ2l0XCJdLCBcInBvc3Rwcm9jZXNzXCI6IGpvaW59LFxuICAgIHtcIm5hbWVcIjogXCJkMDFfMTFcIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCIxXCJ9LCAvWzAtMV0vXSwgXCJwb3N0cHJvY2Vzc1wiOiBqb2lufSxcbiAgICB7XCJuYW1lXCI6IFwiZDAxXzEyXCIsIFwic3ltYm9sc1wiOiBbXCJkMDFfMTFcIl0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJkMDFfMTIkc3RyaW5nJDFcIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCIxXCJ9LCB7XCJsaXRlcmFsXCI6XCIyXCJ9XSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbiBqb2luZXIoZCkge3JldHVybiBkLmpvaW4oJycpO319LFxuICAgIHtcIm5hbWVcIjogXCJkMDFfMTJcIiwgXCJzeW1ib2xzXCI6IFtcImQwMV8xMiRzdHJpbmckMVwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH0sXG4gICAge1wibmFtZVwiOiBcImQwMV8xM1wiLCBcInN5bWJvbHNcIjogW1wiZDAxXzEyXCJdLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwiZDAxXzEzJHN0cmluZyQxXCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiMVwifSwge1wibGl0ZXJhbFwiOlwiM1wifV0sIFwicG9zdHByb2Nlc3NcIjogZnVuY3Rpb24gam9pbmVyKGQpIHtyZXR1cm4gZC5qb2luKCcnKTt9fSxcbiAgICB7XCJuYW1lXCI6IFwiZDAxXzEzXCIsIFwic3ltYm9sc1wiOiBbXCJkMDFfMTMkc3RyaW5nJDFcIl0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJkMDBfMTQkc3RyaW5nJDFcIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCIwXCJ9LCB7XCJsaXRlcmFsXCI6XCIwXCJ9XSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbiBqb2luZXIoZCkge3JldHVybiBkLmpvaW4oJycpO319LFxuICAgIHtcIm5hbWVcIjogXCJkMDBfMTRcIiwgXCJzeW1ib2xzXCI6IFtcImQwMF8xNCRzdHJpbmckMVwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH0sXG4gICAge1wibmFtZVwiOiBcImQwMF8xNFwiLCBcInN5bWJvbHNcIjogW1wiZDAxXzEzXCJdLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwiZDAwXzE0JHN0cmluZyQyXCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiMVwifSwge1wibGl0ZXJhbFwiOlwiNFwifV0sIFwicG9zdHByb2Nlc3NcIjogZnVuY3Rpb24gam9pbmVyKGQpIHtyZXR1cm4gZC5qb2luKCcnKTt9fSxcbiAgICB7XCJuYW1lXCI6IFwiZDAwXzE0XCIsIFwic3ltYm9sc1wiOiBbXCJkMDBfMTQkc3RyaW5nJDJcIl0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJkMDBfMjMkc3RyaW5nJDFcIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCIwXCJ9LCB7XCJsaXRlcmFsXCI6XCIwXCJ9XSwgXCJwb3N0cHJvY2Vzc1wiOiBmdW5jdGlvbiBqb2luZXIoZCkge3JldHVybiBkLmpvaW4oJycpO319LFxuICAgIHtcIm5hbWVcIjogXCJkMDBfMjNcIiwgXCJzeW1ib2xzXCI6IFtcImQwMF8yMyRzdHJpbmckMVwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH0sXG4gICAge1wibmFtZVwiOiBcImQwMF8yM1wiLCBcInN5bWJvbHNcIjogW1wiZDAxXzIzXCJdLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwiZDAxXzIzXCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiMFwifSwgXCJwb3NpdGl2ZV9kaWdpdFwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBqb2lufSxcbiAgICB7XCJuYW1lXCI6IFwiZDAxXzIzXCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiMVwifSwgXCJkaWdpdFwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBqb2lufSxcbiAgICB7XCJuYW1lXCI6IFwiZDAxXzIzXCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiMlwifSwgL1swLTNdL10sIFwicG9zdHByb2Nlc3NcIjogam9pbn0sXG4gICAge1wibmFtZVwiOiBcImQwMV8yOVwiLCBcInN5bWJvbHNcIjogW3tcImxpdGVyYWxcIjpcIjBcIn0sIFwicG9zaXRpdmVfZGlnaXRcIl0sIFwicG9zdHByb2Nlc3NcIjogam9pbn0sXG4gICAge1wibmFtZVwiOiBcImQwMV8yOVwiLCBcInN5bWJvbHNcIjogWy9bMS0yXS8sIFwiZGlnaXRcIl0sIFwicG9zdHByb2Nlc3NcIjogam9pbn0sXG4gICAge1wibmFtZVwiOiBcImQwMV8zMFwiLCBcInN5bWJvbHNcIjogW1wiZDAxXzI5XCJdLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwiZDAxXzMwJHN0cmluZyQxXCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiM1wifSwge1wibGl0ZXJhbFwiOlwiMFwifV0sIFwicG9zdHByb2Nlc3NcIjogZnVuY3Rpb24gam9pbmVyKGQpIHtyZXR1cm4gZC5qb2luKCcnKTt9fSxcbiAgICB7XCJuYW1lXCI6IFwiZDAxXzMwXCIsIFwic3ltYm9sc1wiOiBbXCJkMDFfMzAkc3RyaW5nJDFcIl0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJkMDFfMzFcIiwgXCJzeW1ib2xzXCI6IFtcImQwMV8zMFwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH0sXG4gICAge1wibmFtZVwiOiBcImQwMV8zMSRzdHJpbmckMVwiLCBcInN5bWJvbHNcIjogW3tcImxpdGVyYWxcIjpcIjNcIn0sIHtcImxpdGVyYWxcIjpcIjFcIn1dLCBcInBvc3Rwcm9jZXNzXCI6IGZ1bmN0aW9uIGpvaW5lcihkKSB7cmV0dXJuIGQuam9pbignJyk7fX0sXG4gICAge1wibmFtZVwiOiBcImQwMV8zMVwiLCBcInN5bWJvbHNcIjogW1wiZDAxXzMxJHN0cmluZyQxXCJdLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwiZDAwXzU5JHN0cmluZyQxXCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiMFwifSwge1wibGl0ZXJhbFwiOlwiMFwifV0sIFwicG9zdHByb2Nlc3NcIjogZnVuY3Rpb24gam9pbmVyKGQpIHtyZXR1cm4gZC5qb2luKCcnKTt9fSxcbiAgICB7XCJuYW1lXCI6IFwiZDAwXzU5XCIsIFwic3ltYm9sc1wiOiBbXCJkMDBfNTkkc3RyaW5nJDFcIl0sIFwicG9zdHByb2Nlc3NcIjogaWR9LFxuICAgIHtcIm5hbWVcIjogXCJkMDBfNTlcIiwgXCJzeW1ib2xzXCI6IFtcImQwMV81OVwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBpZH0sXG4gICAge1wibmFtZVwiOiBcImQwMV81OVwiLCBcInN5bWJvbHNcIjogW1wiZDAxXzI5XCJdLCBcInBvc3Rwcm9jZXNzXCI6IGlkfSxcbiAgICB7XCJuYW1lXCI6IFwiZDAxXzU5XCIsIFwic3ltYm9sc1wiOiBbL1szNDVdLywgXCJkaWdpdFwiXSwgXCJwb3N0cHJvY2Vzc1wiOiBqb2lufSxcbiAgICB7XCJuYW1lXCI6IFwiZDIxXzI0XCIsIFwic3ltYm9sc1wiOiBbe1wibGl0ZXJhbFwiOlwiMlwifSwgL1sxLTRdL10sIFwicG9zdHByb2Nlc3NcIjogam9pbn0sXG4gICAge1wibmFtZVwiOiBcImQyNV80MVwiLCBcInN5bWJvbHNcIjogW3tcImxpdGVyYWxcIjpcIjJcIn0sIC9bNS05XS9dLCBcInBvc3Rwcm9jZXNzXCI6IGpvaW59LFxuICAgIHtcIm5hbWVcIjogXCJkMjVfNDFcIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCIzXCJ9LCBcImRpZ2l0XCJdLCBcInBvc3Rwcm9jZXNzXCI6IGpvaW59LFxuICAgIHtcIm5hbWVcIjogXCJkMjVfNDFcIiwgXCJzeW1ib2xzXCI6IFt7XCJsaXRlcmFsXCI6XCI0XCJ9LCAvWzAxXS9dLCBcInBvc3Rwcm9jZXNzXCI6IGpvaW59LFxuICAgIHtcIm5hbWVcIjogXCJfJGVibmYkMVwiLCBcInN5bWJvbHNcIjogW119LFxuICAgIHtcIm5hbWVcIjogXCJfJGVibmYkMVwiLCBcInN5bWJvbHNcIjogW1wiXyRlYm5mJDFcIiwge1wibGl0ZXJhbFwiOlwiIFwifV0sIFwicG9zdHByb2Nlc3NcIjogZnVuY3Rpb24gYXJycHVzaChkKSB7cmV0dXJuIGRbMF0uY29uY2F0KFtkWzFdXSk7fX0sXG4gICAge1wibmFtZVwiOiBcIl9cIiwgXCJzeW1ib2xzXCI6IFtcIl8kZWJuZiQxXCJdfVxuXTtcbmxldCBQYXJzZXJTdGFydCA9IFwiZWR0ZlwiO1xuZXhwb3J0IGRlZmF1bHQgeyBMZXhlciwgUGFyc2VyUnVsZXMsIFBhcnNlclN0YXJ0IH07XG4iLCJpbXBvcnQgeyBwYXJzZSB9IGZyb20gJy4vcGFyc2VyLmpzJ1xuXG5leHBvcnQgY2xhc3MgRXh0RGF0ZVRpbWUge1xuXG4gIHN0YXRpYyBnZXQgdHlwZSgpIHtcbiAgICByZXR1cm4gdGhpcy5uYW1lXG4gIH1cblxuICBzdGF0aWMgcGFyc2UoaW5wdXQpIHtcbiAgICByZXR1cm4gcGFyc2UoaW5wdXQsIHsgdHlwZXM6IFt0aGlzLnR5cGVdIH0pXG4gIH1cblxuICBzdGF0aWMgZnJvbShpbnB1dCkge1xuICAgIHJldHVybiAoaW5wdXQgaW5zdGFuY2VvZiB0aGlzKSA/IGlucHV0IDogbmV3IHRoaXMoaW5wdXQpXG4gIH1cblxuICBzdGF0aWMgVVRDKC4uLmFyZ3MpIHtcbiAgICBsZXQgdGltZSA9IERhdGUuVVRDKC4uLmFyZ3MpXG5cbiAgICAvLyBFQ01BIERhdGUgY29uc3RydWN0b3IgY29udmVydHMgMC05OSB0byAxOTAwLTE5OTkhXG4gICAgaWYgKGFyZ3NbMF0gPj0gMCAmJiBhcmdzWzBdIDwgMTAwKVxuICAgICAgdGltZSA9IGFkaihuZXcgRGF0ZSh0aW1lKSlcblxuICAgIHJldHVybiB0aW1lXG4gIH1cblxuICBnZXQgdHlwZSgpIHtcbiAgICByZXR1cm4gdGhpcy5jb25zdHJ1Y3Rvci50eXBlXG4gIH1cblxuICBnZXQgZWR0ZigpIHtcbiAgICByZXR1cm4gdGhpcy50b0VEVEYoKVxuICB9XG5cbiAgZ2V0IGlzRURURigpIHtcbiAgICByZXR1cm4gdHJ1ZVxuICB9XG5cbiAgdG9KU09OKCkge1xuICAgIHJldHVybiB0aGlzLnRvRURURigpXG4gIH1cblxuICB0b1N0cmluZygpIHtcbiAgICByZXR1cm4gdGhpcy50b0VEVEYoKVxuICB9XG5cbiAgdG9Mb2NhbGVTdHJpbmcoLi4uYXJncykge1xuICAgIHJldHVybiB0aGlzLmxvY2FsaXplKC4uLmFyZ3MpXG4gIH1cblxuICBpbnNwZWN0KCkge1xuICAgIHJldHVybiB0aGlzLnRvRURURigpXG4gIH1cblxuICB2YWx1ZU9mKCkge1xuICAgIHJldHVybiB0aGlzLm1pblxuICB9XG5cbiAgW1N5bWJvbC50b1ByaW1pdGl2ZV0oaGludCkge1xuICAgIHJldHVybiAoaGludCA9PT0gJ251bWJlcicpID8gdGhpcy52YWx1ZU9mKCkgOiB0aGlzLnRvRURURigpXG4gIH1cblxuXG4gIGNvdmVycyhvdGhlcikge1xuICAgIHJldHVybiAodGhpcy5taW4gPD0gb3RoZXIubWluKSAmJiAodGhpcy5tYXggPj0gb3RoZXIubWF4KVxuICB9XG5cbiAgY29tcGFyZShvdGhlcikge1xuICAgIGlmIChvdGhlci5taW4gPT0gbnVsbCB8fCBvdGhlci5tYXggPT0gbnVsbCkgcmV0dXJuIG51bGxcblxuICAgIGxldCBbYSwgeCwgYiwgeV0gPSBbdGhpcy5taW4sIHRoaXMubWF4LCBvdGhlci5taW4sIG90aGVyLm1heF1cblxuICAgIGlmIChhICE9PSBiKVxuICAgICAgcmV0dXJuIGEgPCBiID8gLTEgOiAxXG5cbiAgICBpZiAoeCAhPT0geSlcbiAgICAgIHJldHVybiB4IDwgeSA/IC0xIDogMVxuXG4gICAgcmV0dXJuIDBcbiAgfVxuXG4gIGluY2x1ZGVzKG90aGVyKSB7XG4gICAgbGV0IGNvdmVyZWQgPSB0aGlzLmNvdmVycyhvdGhlcilcbiAgICBpZiAoIWNvdmVyZWQgfHwgIXRoaXNbU3ltYm9sLml0ZXJhdG9yXSkgcmV0dXJuIGNvdmVyZWRcblxuICAgIGZvciAobGV0IGN1ciBvZiB0aGlzKSB7XG4gICAgICBpZiAoY3VyLmVkdGYgPT09IG90aGVyLmVkdGYpIHJldHVybiB0cnVlXG4gICAgfVxuXG4gICAgcmV0dXJuIGZhbHNlXG4gIH1cblxuICAqdW50aWwodGhlbikge1xuICAgIHlpZWxkIHRoaXNcbiAgICBpZiAodGhpcy5jb21wYXJlKHRoZW4pKSB5aWVsZCogdGhpcy5iZXR3ZWVuKHRoZW4pXG4gIH1cblxuICAqdGhyb3VnaCh0aGVuKSB7XG4gICAgeWllbGQqIHRoaXMudW50aWwodGhlbilcbiAgICBpZiAodGhpcy5jb21wYXJlKHRoZW4pKSB5aWVsZCB0aGVuXG4gIH1cblxuICAqYmV0d2Vlbih0aGVuKSB7XG4gICAgdGhlbiA9IHRoaXMuY29uc3RydWN0b3IuZnJvbSh0aGVuKVxuXG4gICAgbGV0IGN1ciA9IHRoaXNcbiAgICBsZXQgZGlyID0gdGhpcy5jb21wYXJlKHRoZW4pXG5cbiAgICBpZiAoIWRpcikgcmV0dXJuXG5cbiAgICBmb3IgKDs7KSB7XG4gICAgICBjdXIgPSBjdXIubmV4dCgtZGlyKVxuICAgICAgaWYgKGN1ci5jb21wYXJlKHRoZW4pICE9PSBkaXIpIGJyZWFrXG4gICAgICB5aWVsZCBjdXJcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gYWRqKGRhdGUsIGJ5ID0gMTkwMCkge1xuICBkYXRlLnNldFVUQ0Z1bGxZZWFyKGRhdGUuZ2V0VVRDRnVsbFllYXIoKSAtIGJ5KVxuICByZXR1cm4gZGF0ZS5nZXRUaW1lKClcbn1cbiIsImltcG9ydCBhc3NlcnQgZnJvbSAnLi9hc3NlcnQuanMnXG5pbXBvcnQgeyBEYXRlIGFzIEV4dERhdGUgfSBmcm9tICcuL2RhdGUuanMnXG5pbXBvcnQgeyBFeHREYXRlVGltZSB9IGZyb20gJy4vaW50ZXJmYWNlLmpzJ1xuaW1wb3J0IHsgU2Vhc29uIH0gZnJvbSAnLi9zZWFzb24uanMnXG5cbmNvbnN0IFYgPSBuZXcgV2Vha01hcCgpXG5cblxuZXhwb3J0IGNsYXNzIEludGVydmFsIGV4dGVuZHMgRXh0RGF0ZVRpbWUge1xuICBjb25zdHJ1Y3RvciguLi5hcmdzKSB7XG4gICAgc3VwZXIoKVxuXG4gICAgVi5zZXQodGhpcywgW251bGwsIG51bGxdKVxuXG4gICAgc3dpdGNoIChhcmdzLmxlbmd0aCkge1xuICAgIGNhc2UgMjpcbiAgICAgIHRoaXMubG93ZXIgPSBhcmdzWzBdXG4gICAgICB0aGlzLnVwcGVyID0gYXJnc1sxXVxuICAgICAgYnJlYWtcblxuICAgIGNhc2UgMTpcbiAgICAgIHN3aXRjaCAodHlwZW9mIGFyZ3NbMF0pIHtcbiAgICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgICAgIGFyZ3NbMF0gPSBJbnRlcnZhbC5wYXJzZShhcmdzWzBdKVxuXG4gICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tZmFsbHRocm91Z2hcbiAgICAgIGNhc2UgJ29iamVjdCc6XG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KGFyZ3NbMF0pKVxuICAgICAgICAgIGFyZ3NbMF0gPSB7IHZhbHVlczogYXJnc1swXSB9XG5cbiAgICAgICAge1xuICAgICAgICAgIGxldCBbb2JqXSA9IGFyZ3NcblxuICAgICAgICAgIGFzc2VydChvYmogIT09IG51bGwpXG4gICAgICAgICAgaWYgKG9iai50eXBlKSBhc3NlcnQuZXF1YWwoJ0ludGVydmFsJywgb2JqLnR5cGUpXG5cbiAgICAgICAgICBhc3NlcnQob2JqLnZhbHVlcylcbiAgICAgICAgICBhc3NlcnQob2JqLnZhbHVlcy5sZW5ndGggPCAzKVxuXG4gICAgICAgICAgdGhpcy5sb3dlciA9IG9iai52YWx1ZXNbMF1cbiAgICAgICAgICB0aGlzLnVwcGVyID0gb2JqLnZhbHVlc1sxXVxuXG4gICAgICAgICAgdGhpcy5lYXJsaWVyID0gb2JqLmVhcmxpZXJcbiAgICAgICAgICB0aGlzLmxhdGVyID0gb2JqLmxhdGVyXG4gICAgICAgIH1cbiAgICAgICAgYnJlYWtcblxuICAgICAgZGVmYXVsdDpcbiAgICAgICAgdGhpcy5sb3dlciA9IGFyZ3NbMF1cbiAgICAgIH1cbiAgICAgIGJyZWFrXG5cbiAgICBjYXNlIDA6XG4gICAgICBicmVha1xuXG4gICAgZGVmYXVsdDpcbiAgICAgIHRocm93IG5ldyBSYW5nZUVycm9yKGBpbnZhbGlkIGludGVydmFsIHZhbHVlOiAke2FyZ3N9YClcbiAgICB9XG4gIH1cblxuICBnZXQgbG93ZXIoKSB7XG4gICAgcmV0dXJuIHRoaXMudmFsdWVzWzBdXG4gIH1cblxuICBzZXQgbG93ZXIodmFsdWUpIHtcbiAgICBpZiAodmFsdWUgPT0gbnVsbClcbiAgICAgIHJldHVybiB0aGlzLnZhbHVlc1swXSA9IG51bGxcblxuICAgIGlmICh2YWx1ZSA9PT0gSW5maW5pdHkgfHwgdmFsdWUgPT09IC1JbmZpbml0eSlcbiAgICAgIHJldHVybiB0aGlzLnZhbHVlc1swXSA9IEluZmluaXR5XG5cbiAgICB2YWx1ZSA9IGdldERhdGVPclNlYXNvbkZyb20odmFsdWUpXG5cbiAgICBpZiAodmFsdWUgPj0gdGhpcy51cHBlciAmJiB0aGlzLnVwcGVyICE9IG51bGwpXG4gICAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcihgaW52YWxpZCBsb3dlciBib3VuZDogJHt2YWx1ZX1gKVxuXG4gICAgdGhpcy52YWx1ZXNbMF0gPSB2YWx1ZVxuICB9XG5cbiAgZ2V0IHVwcGVyKCkge1xuICAgIHJldHVybiB0aGlzLnZhbHVlc1sxXVxuICB9XG5cbiAgc2V0IHVwcGVyKHZhbHVlKSB7XG4gICAgaWYgKHZhbHVlID09IG51bGwpXG4gICAgICByZXR1cm4gdGhpcy52YWx1ZXNbMV0gPSBudWxsXG5cbiAgICBpZiAodmFsdWUgPT09IEluZmluaXR5KVxuICAgICAgcmV0dXJuIHRoaXMudmFsdWVzWzFdID0gSW5maW5pdHlcblxuICAgIHZhbHVlID0gZ2V0RGF0ZU9yU2Vhc29uRnJvbSh2YWx1ZSlcblxuICAgIGlmICh0aGlzLmxvd2VyICE9PSBudWxsICYmIHRoaXMubG93ZXIgIT09IEluZmluaXR5ICYmIHZhbHVlIDw9IHRoaXMubG93ZXIpXG4gICAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcihgaW52YWxpZCB1cHBlciBib3VuZDogJHt2YWx1ZX1gKVxuXG4gICAgdGhpcy52YWx1ZXNbMV0gPSAgdmFsdWVcbiAgfVxuXG4gIGdldCBmaW5pdGUoKSB7XG4gICAgcmV0dXJuICh0aGlzLmxvd2VyICE9IG51bGwgJiYgdGhpcy5sb3dlciAhPT0gSW5maW5pdHkpICYmXG4gICAgICAodGhpcy51cHBlciAhPSBudWxsICYmIHRoaXMudXBwZXIgIT09IEluZmluaXR5KVxuICB9XG5cbiAgKltTeW1ib2wuaXRlcmF0b3JdKCkge1xuICAgIGlmICghdGhpcy5maW5pdGUpIHRocm93IEVycm9yKCdjYW5ub3QgaXRlcmF0ZSBpbmZpbml0ZSBpbnRlcnZhbCcpXG4gICAgeWllbGQqIHRoaXMubG93ZXIudGhyb3VnaCh0aGlzLnVwcGVyKVxuICB9XG5cbiAgZ2V0IHZhbHVlcygpIHtcbiAgICByZXR1cm4gVi5nZXQodGhpcylcbiAgfVxuXG4gIGdldCBtaW4oKSB7XG4gICAgbGV0IHYgPSB0aGlzLmxvd2VyXG4gICAgcmV0dXJuICF2ID8gbnVsbCA6ICh2ID09PSBJbmZpbml0eSkgPyAtSW5maW5pdHkgOiB2Lm1pblxuICB9XG5cbiAgZ2V0IG1heCgpIHtcbiAgICBsZXQgdiA9IHRoaXMudXBwZXJcbiAgICByZXR1cm4gIXYgPyBudWxsIDogKHYgPT09IEluZmluaXR5KSA/IEluZmluaXR5IDogdi5tYXhcbiAgfVxuXG4gIHRvRURURigpIHtcbiAgICByZXR1cm4gdGhpcy52YWx1ZXNcbiAgICAgIC5tYXAodiA9PiB7XG4gICAgICAgIGlmICh2ID09PSBJbmZpbml0eSkgcmV0dXJuICcuLidcbiAgICAgICAgaWYgKCF2KSByZXR1cm4gJydcbiAgICAgICAgcmV0dXJuIHYuZWR0ZlxuICAgICAgfSlcbiAgICAgIC5qb2luKCcvJylcbiAgfVxufVxuXG5mdW5jdGlvbiBnZXREYXRlT3JTZWFzb25Gcm9tKHZhbHVlKSB7XG4gIHRyeSB7XG4gICAgcmV0dXJuIEV4dERhdGUuZnJvbSh2YWx1ZSlcbiAgfSBjYXRjaCAoZGUpIHtcbiAgICByZXR1cm4gU2Vhc29uLmZyb20odmFsdWUpXG4gIH1cbn1cbiIsImltcG9ydCBhc3NlcnQgZnJvbSAnLi9hc3NlcnQuanMnXG5pbXBvcnQgeyBEYXRlIH0gZnJvbSAnLi9kYXRlLmpzJ1xuaW1wb3J0IHsgRXh0RGF0ZVRpbWUgfSBmcm9tICcuL2ludGVyZmFjZS5qcydcblxuY29uc3QgeyBpc0FycmF5IH0gPSBBcnJheVxuY29uc3QgViA9IG5ldyBXZWFrTWFwKClcblxuXG5leHBvcnQgY2xhc3MgTGlzdCBleHRlbmRzIEV4dERhdGVUaW1lIHtcbiAgY29uc3RydWN0b3IoLi4uYXJncykge1xuICAgIHN1cGVyKClcblxuICAgIFYuc2V0KHRoaXMsIFtdKVxuXG4gICAgaWYgKGFyZ3MubGVuZ3RoID4gMSkgYXJncyA9IFthcmdzXVxuXG4gICAgaWYgKGFyZ3MubGVuZ3RoKSB7XG4gICAgICBzd2l0Y2ggKHR5cGVvZiBhcmdzWzBdKSB7XG4gICAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgICBhcmdzWzBdID0gbmV3LnRhcmdldC5wYXJzZShhcmdzWzBdKVxuXG4gICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tZmFsbHRocm91Z2hcbiAgICAgIGNhc2UgJ29iamVjdCc6XG4gICAgICAgIGlmIChpc0FycmF5KGFyZ3NbMF0pKVxuICAgICAgICAgIGFyZ3NbMF0gPSB7IHZhbHVlczogYXJnc1swXSB9XG5cbiAgICAgICAge1xuICAgICAgICAgIGxldCBbb2JqXSA9IGFyZ3NcblxuICAgICAgICAgIGFzc2VydChvYmogIT09IG51bGwpXG4gICAgICAgICAgaWYgKG9iai50eXBlKSBhc3NlcnQuZXF1YWwodGhpcy50eXBlLCBvYmoudHlwZSlcblxuICAgICAgICAgIGFzc2VydChvYmoudmFsdWVzKVxuICAgICAgICAgIHRoaXMuY29uY2F0KC4uLm9iai52YWx1ZXMpXG5cbiAgICAgICAgICB0aGlzLmVhcmxpZXIgPSAhIW9iai5lYXJsaWVyXG4gICAgICAgICAgdGhpcy5sYXRlciA9ICEhb2JqLmxhdGVyXG4gICAgICAgIH1cbiAgICAgICAgYnJlYWtcblxuICAgICAgZGVmYXVsdDpcbiAgICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoYGludmFsaWQgJHt0aGlzLnR5cGV9IHZhbHVlOiAke2FyZ3N9YClcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBnZXQgdmFsdWVzKCkge1xuICAgIHJldHVybiBWLmdldCh0aGlzKVxuICB9XG5cbiAgZ2V0IGxlbmd0aCgpIHtcbiAgICByZXR1cm4gdGhpcy52YWx1ZXMubGVuZ3RoXG4gIH1cblxuICBnZXQgZW1wdHkoKSB7XG4gICAgcmV0dXJuIHRoaXMubGVuZ3RoID09PSAwXG4gIH1cblxuICBnZXQgZmlyc3QoKSB7XG4gICAgbGV0IHZhbHVlID0gdGhpcy52YWx1ZXNbMF1cbiAgICByZXR1cm4gaXNBcnJheSh2YWx1ZSkgPyB2YWx1ZVswXSA6IHZhbHVlXG4gIH1cblxuICBnZXQgbGFzdCgpIHtcbiAgICBsZXQgdmFsdWUgPSB0aGlzLnZhbHVlc1t0aGlzLmxlbmd0aCAtIDFdXG4gICAgcmV0dXJuIGlzQXJyYXkodmFsdWUpID8gdmFsdWVbMF0gOiB2YWx1ZVxuICB9XG5cbiAgY2xlYXIoKSB7XG4gICAgcmV0dXJuICh0aGlzLnZhbHVlcy5sZW5ndGggPSAwKSwgdGhpc1xuICB9XG5cbiAgY29uY2F0KC4uLmFyZ3MpIHtcbiAgICBmb3IgKGxldCB2YWx1ZSBvZiBhcmdzKSB0aGlzLnB1c2godmFsdWUpXG4gICAgcmV0dXJuIHRoaXNcbiAgfVxuXG4gIHB1c2godmFsdWUpIHtcbiAgICBpZiAoaXNBcnJheSh2YWx1ZSkpIHtcbiAgICAgIGFzc2VydC5lcXVhbCgyLCB2YWx1ZS5sZW5ndGgpXG4gICAgICByZXR1cm4gdGhpcy52YWx1ZXMucHVzaCh2YWx1ZS5tYXAodiA9PiBEYXRlLmZyb20odikpKVxuICAgIH1cblxuICAgIHJldHVybiB0aGlzLnZhbHVlcy5wdXNoKERhdGUuZnJvbSh2YWx1ZSkpXG4gIH1cblxuICAqW1N5bWJvbC5pdGVyYXRvcl0oKSB7XG4gICAgZm9yIChsZXQgdmFsdWUgb2YgdGhpcy52YWx1ZXMpIHtcbiAgICAgIGlmIChpc0FycmF5KHZhbHVlKSlcbiAgICAgICAgeWllbGQqIHZhbHVlWzBdLnRocm91Z2godmFsdWVbMV0pXG4gICAgICBlbHNlXG4gICAgICAgIHlpZWxkIHZhbHVlXG4gICAgfVxuICB9XG5cbiAgZ2V0IG1pbigpIHtcbiAgICByZXR1cm4gdGhpcy5lYXJsaWVyID8gLUluZmluaXR5IDogKHRoaXMuZW1wdHkgPyAwIDogdGhpcy5maXJzdC5taW4pXG4gIH1cblxuICBnZXQgbWF4KCkge1xuICAgIHJldHVybiB0aGlzLmxhdGVyID8gSW5maW5pdHkgOiAodGhpcy5lbXB0eSA/IDAgOiB0aGlzLmxhc3QubWF4KVxuICB9XG5cbiAgY29udGVudCgpIHtcbiAgICByZXR1cm4gdGhpc1xuICAgICAgLnZhbHVlc1xuICAgICAgLm1hcCh2ID0+IGlzQXJyYXkodikgPyB2Lm1hcChkID0+IGQuZWR0Zikuam9pbignLi4nKSA6IHYuZWR0ZilcbiAgICAgIC5qb2luKCcsJylcbiAgfVxuXG4gIHRvRURURigpIHtcbiAgICByZXR1cm4gdGhpcy53cmFwKHRoaXMuZW1wdHkgP1xuICAgICAgJycgOlxuICAgICAgYCR7dGhpcy5lYXJsaWVyID8gJy4uJyA6ICcnfSR7dGhpcy5jb250ZW50KCl9JHt0aGlzLmxhdGVyID8gJy4uJyA6ICcnfWBcbiAgICApXG4gIH1cblxuICB3cmFwKGNvbnRlbnQpIHtcbiAgICByZXR1cm4gYHske2NvbnRlbnR9fWBcbiAgfVxufVxuIiwiY29uc3Qga2V5cyA9IFJlZmxlY3Qub3duS2V5cy5iaW5kKFJlZmxlY3QpXG5jb25zdCBkZXNjcmlwdG9yID0gT2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvci5iaW5kKE9iamVjdClcbmNvbnN0IGRlZmluZSA9IE9iamVjdC5kZWZpbmVQcm9wZXJ0eS5iaW5kKE9iamVjdClcbmNvbnN0IGhhcyA9IE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHlcblxuZXhwb3J0IGZ1bmN0aW9uIG1peGluKHRhcmdldCwgLi4ubWl4aW5zKSB7XG4gIGZvciAobGV0IHNvdXJjZSBvZiBtaXhpbnMpIHtcbiAgICBpbmhlcml0KHRhcmdldCwgc291cmNlKVxuICAgIGluaGVyaXQodGFyZ2V0LnByb3RvdHlwZSwgc291cmNlLnByb3RvdHlwZSlcbiAgfVxuXG4gIHJldHVybiB0YXJnZXRcbn1cblxuZnVuY3Rpb24gaW5oZXJpdCh0YXJnZXQsIHNvdXJjZSkge1xuICBmb3IgKGxldCBrZXkgb2Yga2V5cyhzb3VyY2UpKSB7XG4gICAgaWYgKCFoYXMuY2FsbCh0YXJnZXQsIGtleSkpIHtcbiAgICAgIGRlZmluZSh0YXJnZXQsIGtleSwgZGVzY3JpcHRvcihzb3VyY2UsIGtleSkpXG4gICAgfVxuICB9XG59XG4iLCJpbXBvcnQgbmVhcmxleSBmcm9tICduZWFybGV5J1xuaW1wb3J0IGdyYW1tYXIgZnJvbSAnLi9ncmFtbWFyLmpzJ1xuXG5leHBvcnQgY29uc3QgZGVmYXVsdHMgPSB7XG4gIGxldmVsOiAyLFxuICB0eXBlczogW10sXG4gIHNlYXNvbkludGVydmFsczogZmFsc2Vcbn1cblxuZnVuY3Rpb24gYnlMZXZlbChhLCBiKSB7XG4gIHJldHVybiBhLmxldmVsIDwgYi5sZXZlbCA/IC0xIDogYS5sZXZlbCA+IGIubGV2ZWwgPyAxIDogMFxufVxuXG5mdW5jdGlvbiBsaW1pdChyZXN1bHRzLCBjb25zdHJhaW50cyA9IHt9KSB7XG4gIGlmICghcmVzdWx0cy5sZW5ndGgpIHJldHVybiByZXN1bHRzXG5cbiAgbGV0IHtcbiAgICBsZXZlbCxcbiAgICB0eXBlcyxcbiAgICBzZWFzb25JbnRlcnZhbHNcbiAgfSA9IHsgLi4uZGVmYXVsdHMsIC4uLmNvbnN0cmFpbnRzIH1cblxuXG4gIHJldHVybiByZXN1bHRzLmZpbHRlcihyZXMgPT4ge1xuICAgIGlmIChzZWFzb25JbnRlcnZhbHMgJiYgaXNTZWFzb25JbnRlcnZhbChyZXMpKVxuICAgICAgcmV0dXJuIHRydWVcblxuICAgIGlmIChyZXMubGV2ZWwgPiBsZXZlbClcbiAgICAgIHJldHVybiBmYWxzZVxuICAgIGlmICh0eXBlcy5sZW5ndGggJiYgIXR5cGVzLmluY2x1ZGVzKHJlcy50eXBlKSlcbiAgICAgIHJldHVybiBmYWxzZVxuXG4gICAgcmV0dXJuIHRydWVcbiAgfSlcbn1cblxuZnVuY3Rpb24gaXNTZWFzb25JbnRlcnZhbCh7IHR5cGUsIHZhbHVlcyB9KSB7XG4gIHJldHVybiB0eXBlID09PSAnSW50ZXJ2YWwnICYmIHZhbHVlc1swXS50eXBlID09PSAnU2Vhc29uJ1xufVxuXG5mdW5jdGlvbiBiZXN0KHJlc3VsdHMpIHtcbiAgaWYgKHJlc3VsdHMubGVuZ3RoIDwgMikgcmV0dXJuIHJlc3VsdHNbMF1cblxuICAvLyBJZiB0aGVyZSBhcmUgbXVsdGlwbGUgcmVzdWx0cywgcGljayB0aGUgZmlyc3RcbiAgLy8gb25lIG9uIHRoZSBsb3dlc3QgbGV2ZWwhXG4gIHJldHVybiByZXN1bHRzLnNvcnQoYnlMZXZlbClbMF1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlKGlucHV0LCBjb25zdHJhaW50cyA9IHt9KSB7XG4gIHRyeSB7XG4gICAgbGV0IG5lcCA9IHBhcnNlcigpXG4gICAgbGV0IHJlcyA9IGJlc3QobGltaXQobmVwLmZlZWQoaW5wdXQpLnJlc3VsdHMsIGNvbnN0cmFpbnRzKSlcblxuICAgIGlmICghcmVzKSB0aHJvdyBuZXcgRXJyb3IoJ2VkdGY6IE5vIHBvc3NpYmxlIHBhcnNpbmdzIChARU9TKScpXG5cbiAgICByZXR1cm4gcmVzXG5cbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBlcnJvci5tZXNzYWdlICs9IGAgZm9yIFwiJHtpbnB1dH1cImBcbiAgICB0aHJvdyBlcnJvclxuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZXIoKSB7XG4gIHJldHVybiBuZXcgbmVhcmxleS5QYXJzZXIoZ3JhbW1hci5QYXJzZXJSdWxlcywgZ3JhbW1hci5QYXJzZXJTdGFydClcbn1cbiIsImltcG9ydCBhc3NlcnQgZnJvbSAnLi9hc3NlcnQuanMnXG5pbXBvcnQgeyBFeHREYXRlVGltZSB9IGZyb20gJy4vaW50ZXJmYWNlLmpzJ1xuaW1wb3J0IHsgcGFkIH0gZnJvbSAnLi9kYXRlLmpzJ1xuXG5jb25zdCBWID0gbmV3IFdlYWtNYXAoKVxuXG5leHBvcnQgY2xhc3MgU2Vhc29uIGV4dGVuZHMgRXh0RGF0ZVRpbWUge1xuICBjb25zdHJ1Y3RvcihpbnB1dCkge1xuICAgIHN1cGVyKClcblxuICAgIFYuc2V0KHRoaXMsIFtdKVxuXG4gICAgc3dpdGNoICh0eXBlb2YgaW5wdXQpIHtcbiAgICBjYXNlICdudW1iZXInOlxuICAgICAgdGhpcy55ZWFyID0gaW5wdXRcbiAgICAgIHRoaXMuc2Vhc29uID0gYXJndW1lbnRzWzFdIHx8IDIxXG4gICAgICBicmVha1xuXG4gICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgIGlucHV0ID0gU2Vhc29uLnBhcnNlKGlucHV0KVxuXG4gICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWZhbGx0aHJvdWdoXG4gICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgIGlmIChBcnJheS5pc0FycmF5KGlucHV0KSlcbiAgICAgICAgaW5wdXQgPSB7IHZhbHVlczogaW5wdXQgfVxuXG4gICAgICB7XG4gICAgICAgIGFzc2VydChpbnB1dCAhPT0gbnVsbClcbiAgICAgICAgaWYgKGlucHV0LnR5cGUpIGFzc2VydC5lcXVhbCgnU2Vhc29uJywgaW5wdXQudHlwZSlcblxuICAgICAgICBhc3NlcnQoaW5wdXQudmFsdWVzKVxuICAgICAgICBhc3NlcnQuZXF1YWwoMiwgaW5wdXQudmFsdWVzLmxlbmd0aClcblxuICAgICAgICB0aGlzLnllYXIgPSBpbnB1dC52YWx1ZXNbMF1cbiAgICAgICAgdGhpcy5zZWFzb24gPSBpbnB1dC52YWx1ZXNbMV1cbiAgICAgIH1cbiAgICAgIGJyZWFrXG5cbiAgICBjYXNlICd1bmRlZmluZWQnOlxuICAgICAgdGhpcy55ZWFyID0gbmV3IERhdGUoKS5nZXRVVENGdWxsWWVhcigpXG4gICAgICB0aGlzLnNlYXNvbiA9IDIxXG4gICAgICBicmVha1xuXG4gICAgZGVmYXVsdDpcbiAgICAgIHRocm93IG5ldyBSYW5nZUVycm9yKCdJbnZhbGlkIHNlYXNvbiB2YWx1ZScpXG4gICAgfVxuICB9XG5cbiAgZ2V0IHllYXIoKSB7XG4gICAgcmV0dXJuIHRoaXMudmFsdWVzWzBdXG4gIH1cblxuICBzZXQgeWVhcih5ZWFyKSB7XG4gICAgdGhpcy52YWx1ZXNbMF0gPSBOdW1iZXIoeWVhcilcbiAgfVxuXG4gIGdldCBzZWFzb24oKSB7XG4gICAgcmV0dXJuIHRoaXMudmFsdWVzWzFdXG4gIH1cblxuICBzZXQgc2Vhc29uKHNlYXNvbikge1xuICAgIHRoaXMudmFsdWVzWzFdID0gdmFsaWRhdGUoTnVtYmVyKHNlYXNvbikpXG4gIH1cblxuICBnZXQgdmFsdWVzKCkge1xuICAgIHJldHVybiBWLmdldCh0aGlzKVxuICB9XG5cbiAgbmV4dChrID0gMSkge1xuICAgIGxldCB7IHNlYXNvbiwgeWVhciB9ID0gdGhpc1xuXG4gICAgc3dpdGNoICh0cnVlKSB7XG4gICAgY2FzZSAoc2Vhc29uID49IDIxICYmIHNlYXNvbiA8PSAzNik6XG4gICAgICBbeWVhciwgc2Vhc29uXSA9IGluYyh5ZWFyLCBzZWFzb24sIGssIHNlYXNvbiAtIChzZWFzb24gLSAyMSkgJSA0LCA0KVxuICAgICAgYnJlYWtcbiAgICBjYXNlIChzZWFzb24gPj0gMzcgJiYgc2Vhc29uIDw9IDM5KTpcbiAgICAgIFt5ZWFyLCBzZWFzb25dID0gaW5jKHllYXIsIHNlYXNvbiwgaywgMzcsIDMpXG4gICAgICBicmVha1xuICAgIGNhc2UgKHNlYXNvbiA+PSA0MCAmJiBzZWFzb24gPD0gNDEpOlxuICAgICAgW3llYXIsIHNlYXNvbl0gPSBpbmMoeWVhciwgc2Vhc29uLCBrLCA0MCwgMilcbiAgICAgIGJyZWFrXG4gICAgZGVmYXVsdDpcbiAgICAgIHRocm93IG5ldyBSYW5nZUVycm9yKGBDYW5ub3QgY29tcHV0ZSBuZXh0L3ByZXYgZm9yIHNlYXNvbiAke3NlYXNvbn1gKVxuICAgIH1cblxuICAgIHJldHVybiBuZXcgU2Vhc29uKHllYXIsIHNlYXNvbilcbiAgfVxuXG4gIHByZXYoayA9IDEpIHtcbiAgICByZXR1cm4gdGhpcy5uZXh0KC1rKVxuICB9XG5cbiAgZ2V0IG1pbigpIHsgLy8gZXNsaW50LWRpc2FibGUtbGluZSBjb21wbGV4aXR5XG4gICAgc3dpdGNoICh0aGlzLnNlYXNvbikge1xuICAgIGNhc2UgMjE6XG4gICAgY2FzZSAyNTpcbiAgICBjYXNlIDMyOlxuICAgIGNhc2UgMzM6XG4gICAgY2FzZSA0MDpcbiAgICBjYXNlIDM3OlxuICAgICAgcmV0dXJuIEV4dERhdGVUaW1lLlVUQyh0aGlzLnllYXIsIDApXG5cbiAgICBjYXNlIDIyOlxuICAgIGNhc2UgMjY6XG4gICAgY2FzZSAzMTpcbiAgICBjYXNlIDM0OlxuICAgICAgcmV0dXJuIEV4dERhdGVUaW1lLlVUQyh0aGlzLnllYXIsIDMpXG5cbiAgICBjYXNlIDIzOlxuICAgIGNhc2UgMjc6XG4gICAgY2FzZSAzMDpcbiAgICBjYXNlIDM1OlxuICAgIGNhc2UgNDE6XG4gICAgICByZXR1cm4gRXh0RGF0ZVRpbWUuVVRDKHRoaXMueWVhciwgNilcblxuICAgIGNhc2UgMjQ6XG4gICAgY2FzZSAyODpcbiAgICBjYXNlIDI5OlxuICAgIGNhc2UgMzY6XG4gICAgICByZXR1cm4gRXh0RGF0ZVRpbWUuVVRDKHRoaXMueWVhciwgOSlcblxuICAgIGNhc2UgMzg6XG4gICAgICByZXR1cm4gRXh0RGF0ZVRpbWUuVVRDKHRoaXMueWVhciwgNClcblxuICAgIGNhc2UgMzk6XG4gICAgICByZXR1cm4gRXh0RGF0ZVRpbWUuVVRDKHRoaXMueWVhciwgOClcblxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gRXh0RGF0ZVRpbWUuVVRDKHRoaXMueWVhciwgMClcbiAgICB9XG4gIH1cblxuICBnZXQgbWF4KCkgeyAvLyBlc2xpbnQtZGlzYWJsZS1saW5lIGNvbXBsZXhpdHlcbiAgICBzd2l0Y2ggKHRoaXMuc2Vhc29uKSB7XG4gICAgY2FzZSAyMTpcbiAgICBjYXNlIDI1OlxuICAgIGNhc2UgMzI6XG4gICAgY2FzZSAzMzpcbiAgICAgIHJldHVybiBFeHREYXRlVGltZS5VVEModGhpcy55ZWFyLCAzKSAtIDFcblxuICAgIGNhc2UgMjI6XG4gICAgY2FzZSAyNjpcbiAgICBjYXNlIDMxOlxuICAgIGNhc2UgMzQ6XG4gICAgY2FzZSA0MDpcbiAgICAgIHJldHVybiBFeHREYXRlVGltZS5VVEModGhpcy55ZWFyLCA2KSAtIDFcblxuICAgIGNhc2UgMjM6XG4gICAgY2FzZSAyNzpcbiAgICBjYXNlIDMwOlxuICAgIGNhc2UgMzU6XG4gICAgICByZXR1cm4gRXh0RGF0ZVRpbWUuVVRDKHRoaXMueWVhciwgOSkgLSAxXG5cbiAgICBjYXNlIDI0OlxuICAgIGNhc2UgMjg6XG4gICAgY2FzZSAyOTpcbiAgICBjYXNlIDM2OlxuICAgIGNhc2UgNDE6XG4gICAgY2FzZSAzOTpcbiAgICAgIHJldHVybiBFeHREYXRlVGltZS5VVEModGhpcy55ZWFyICsgMSwgMCkgLSAxXG5cbiAgICBjYXNlIDM3OlxuICAgICAgcmV0dXJuIEV4dERhdGVUaW1lLlVUQyh0aGlzLnllYXIsIDUpIC0gMVxuXG4gICAgY2FzZSAzODpcbiAgICAgIHJldHVybiBFeHREYXRlVGltZS5VVEModGhpcy55ZWFyLCA5KSAtIDFcblxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gRXh0RGF0ZVRpbWUuVVRDKHRoaXMueWVhciArIDEsIDApIC0gMVxuICAgIH1cbiAgfVxuXG4gIHRvRURURigpIHtcbiAgICByZXR1cm4gYCR7dGhpcy55ZWFyIDwgMCA/ICctJyA6ICcnfSR7cGFkKHRoaXMueWVhcil9LSR7dGhpcy5zZWFzb259YFxuICB9XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlKHNlYXNvbikge1xuICBpZiAoaXNOYU4oc2Vhc29uKSB8fCBzZWFzb24gPCAyMSB8fCBzZWFzb24gPT09IEluZmluaXR5KVxuICAgIHRocm93IG5ldyBSYW5nZUVycm9yKGBpbnZhbGlkIGRpdmlzaW9uIG9mIHllYXI6ICR7c2Vhc29ufWApXG4gIHJldHVybiBzZWFzb25cbn1cblxuZnVuY3Rpb24gaW5jKHllYXIsIHNlYXNvbiwgYnksIGJhc2UsIHNpemUpIHtcbiAgY29uc3QgbSA9IChzZWFzb24gKyBieSkgLSBiYXNlXG5cbiAgcmV0dXJuIFtcbiAgICB5ZWFyICsgTWF0aC5mbG9vcihtIC8gc2l6ZSksXG4gICAgdmFsaWRhdGUoYmFzZSArIChtICUgc2l6ZSArIHNpemUpICUgc2l6ZSlcbiAgXVxufVxuIiwiaW1wb3J0IHsgTGlzdCB9IGZyb20gJy4vbGlzdC5qcydcbmltcG9ydCB7IHBhcnNlIH0gZnJvbSAnLi9wYXJzZXIuanMnXG5cbmV4cG9ydCBjbGFzcyBTZXQgZXh0ZW5kcyBMaXN0IHtcbiAgc3RhdGljIHBhcnNlKGlucHV0KSB7XG4gICAgcmV0dXJuIHBhcnNlKGlucHV0LCB7IHR5cGVzOiBbJ1NldCddIH0pXG4gIH1cblxuICBnZXQgdHlwZSgpIHtcbiAgICByZXR1cm4gJ1NldCdcbiAgfVxuXG4gIHdyYXAoY29udGVudCkge1xuICAgIHJldHVybiBgWyR7Y29udGVudH1dYFxuICB9XG59XG4iLCJleHBvcnQgeyBEYXRlIH0gZnJvbSAnLi9kYXRlLmpzJ1xuZXhwb3J0IHsgWWVhciB9IGZyb20gJy4veWVhci5qcydcbmV4cG9ydCB7IERlY2FkZSB9IGZyb20gJy4vZGVjYWRlLmpzJ1xuZXhwb3J0IHsgQ2VudHVyeSB9IGZyb20gJy4vY2VudHVyeS5qcydcbmV4cG9ydCB7IFNlYXNvbiB9IGZyb20gJy4vc2Vhc29uLmpzJ1xuZXhwb3J0IHsgSW50ZXJ2YWwgfSBmcm9tICcuL2ludGVydmFsLmpzJ1xuZXhwb3J0IHsgTGlzdCB9IGZyb20gJy4vbGlzdC5qcydcbmV4cG9ydCB7IFNldCB9IGZyb20gJy4vc2V0LmpzJ1xuIiwiaW1wb3J0IHsgQml0bWFzayB9IGZyb20gJy4vYml0bWFzay5qcydcbmNvbnN0IHsgYXNzaWduIH0gPSBPYmplY3RcblxuXG5leHBvcnQgZnVuY3Rpb24gbnVtKGRhdGEpIHtcbiAgcmV0dXJuIE51bWJlcihBcnJheS5pc0FycmF5KGRhdGEpID8gZGF0YS5qb2luKCcnKSA6IGRhdGEpXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBqb2luKGRhdGEpIHtcbiAgcmV0dXJuIGRhdGEuam9pbignJylcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHplcm8oKSB7IHJldHVybiAwIH1cblxuZXhwb3J0IGZ1bmN0aW9uIG5vdGhpbmcoKSB7IHJldHVybiBudWxsIH1cblxuZXhwb3J0IGZ1bmN0aW9uIHBpY2soLi4uYXJncykge1xuICByZXR1cm4gYXJncy5sZW5ndGggPT09IDEgP1xuICAgIGRhdGEgPT4gZGF0YVthcmdzWzBdXSA6XG4gICAgZGF0YSA9PiBjb25jYXQoZGF0YSwgYXJncylcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBsdWNrKC4uLmFyZ3MpIHtcbiAgcmV0dXJuIGRhdGEgPT4gYXJncy5tYXAoaSA9PiBkYXRhW2ldKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gY29uY2F0KGRhdGEsIGlkeCA9IGRhdGEua2V5cygpKSB7XG4gIHJldHVybiBBcnJheS5mcm9tKGlkeClcbiAgICAucmVkdWNlKChtZW1vLCBpKSA9PiBkYXRhW2ldICE9PSBudWxsID8gbWVtby5jb25jYXQoZGF0YVtpXSkgOiBtZW1vLCBbXSlcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1lcmdlKC4uLmFyZ3MpIHtcbiAgaWYgKHR5cGVvZiBhcmdzW2FyZ3MubGVuZ3RoIC0gMV0gPT09ICdvYmplY3QnKVxuICAgIHZhciBleHRyYSA9IGFyZ3MucG9wKClcblxuICByZXR1cm4gZGF0YSA9PiBhc3NpZ24oYXJncy5yZWR1Y2UoKGEsIGkpID0+IGFzc2lnbihhLCBkYXRhW2ldKSwge30pLCBleHRyYSlcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGludGVydmFsKGxldmVsKSB7XG4gIHJldHVybiBkYXRhID0+ICh7XG4gICAgdmFsdWVzOiBbZGF0YVswXSwgZGF0YVsyXV0sXG4gICAgdHlwZTogJ0ludGVydmFsJyxcbiAgICBsZXZlbFxuICB9KVxufVxuXG5leHBvcnQgZnVuY3Rpb24gbWFza2VkKHR5cGUgPSAndW5zcGVjaWZpZWQnLCBzeW1ib2wgPSAnWCcpIHtcbiAgcmV0dXJuIChkYXRhLCBfLCByZWplY3QpID0+IHtcbiAgICBkYXRhID0gZGF0YS5qb2luKCcnKVxuXG4gICAgbGV0IG5lZ2F0aXZlID0gZGF0YS5zdGFydHNXaXRoKCctJylcbiAgICBsZXQgbWFzayA9IGRhdGEucmVwbGFjZSgvLS9nLCAnJylcblxuICAgIGlmIChtYXNrLmluZGV4T2Yoc3ltYm9sKSA9PT0gLTEpIHJldHVybiByZWplY3RcblxuICAgIGxldCB2YWx1ZXMgPSBCaXRtYXNrLnZhbHVlcyhtYXNrLCAwKVxuXG4gICAgaWYgKG5lZ2F0aXZlKSB2YWx1ZXNbMF0gPSAtdmFsdWVzWzBdXG5cbiAgICByZXR1cm4ge1xuICAgICAgdmFsdWVzLCBbdHlwZV06IEJpdG1hc2suY29tcHV0ZShtYXNrKVxuICAgIH1cbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZGF0ZSh2YWx1ZXMsIGxldmVsID0gMCwgZXh0cmEgPSBudWxsKSB7XG4gIHJldHVybiBhc3NpZ24oe1xuICAgIHR5cGU6ICdEYXRlJyxcbiAgICBsZXZlbCxcbiAgICB2YWx1ZXM6IEJpdG1hc2subm9ybWFsaXplKHZhbHVlcy5tYXAoTnVtYmVyKSlcbiAgfSwgZXh0cmEpXG59XG5cbmV4cG9ydCBmdW5jdGlvbiB5ZWFyKHZhbHVlcywgbGV2ZWwgPSAxLCBleHRyYSA9IG51bGwpIHtcbiAgcmV0dXJuIGFzc2lnbih7XG4gICAgdHlwZTogJ1llYXInLFxuICAgIGxldmVsLFxuICAgIHZhbHVlczogdmFsdWVzLm1hcChOdW1iZXIpXG4gIH0sIGV4dHJhKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gY2VudHVyeSh2YWx1ZSwgbGV2ZWwgPSAwKSB7XG4gIHJldHVybiB7XG4gICAgdHlwZTogJ0NlbnR1cnknLFxuICAgIGxldmVsLFxuICAgIHZhbHVlczogW3ZhbHVlXVxuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkZWNhZGUodmFsdWUsIGxldmVsID0gMikge1xuICByZXR1cm4ge1xuICAgIHR5cGU6ICdEZWNhZGUnLFxuICAgIGxldmVsLFxuICAgIHZhbHVlczogW3ZhbHVlXVxuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkYXRldGltZShkYXRhKSB7XG4gIGxldCBvZmZzZXQgPSBkYXRhWzNdXG4gIGlmIChvZmZzZXQgPT0gbnVsbCkgb2Zmc2V0ID0gbmV3IERhdGUoKS5nZXRUaW1lem9uZU9mZnNldCgpXG5cbiAgcmV0dXJuIHtcbiAgICB2YWx1ZXM6IEJpdG1hc2subm9ybWFsaXplKGRhdGFbMF0ubWFwKE51bWJlcikpLmNvbmNhdChkYXRhWzJdKSxcbiAgICBvZmZzZXQsXG4gICAgdHlwZTogJ0RhdGUnLFxuICAgIGxldmVsOiAwXG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNlYXNvbihkYXRhLCBsZXZlbCA9IDEpIHtcbiAgcmV0dXJuIHtcbiAgICB0eXBlOiAnU2Vhc29uJyxcbiAgICBsZXZlbCxcbiAgICB2YWx1ZXM6IFtOdW1iZXIoZGF0YVswXSksIE51bWJlcihkYXRhWzJdKV1cbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gbGlzdChkYXRhKSB7XG4gIHJldHVybiBhc3NpZ24oeyB2YWx1ZXM6IGRhdGFbMV0sIGxldmVsOiAyIH0sIGRhdGFbMF0sIGRhdGFbMl0pXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBxdWFsaWZ5KFtwYXJ0c10sIF8sIHJlamVjdCkge1xuICBsZXQgcSA9IHtcbiAgICB1bmNlcnRhaW46IG5ldyBCaXRtYXNrKCksIGFwcHJveGltYXRlOiBuZXcgQml0bWFzaygpXG4gIH1cblxuICBsZXQgdmFsdWVzID0gcGFydHNcbiAgICAubWFwKChbbGhzLCBwYXJ0LCByaHNdLCBpZHgpID0+IHtcbiAgICAgIGZvciAobGV0IHVhIGluIGxocykgcVt1YV0ucXVhbGlmeShpZHggKiAyKVxuICAgICAgZm9yIChsZXQgdWEgaW4gcmhzKSBxW3VhXS5xdWFsaWZ5KDEgKyBpZHggKiAyKVxuICAgICAgcmV0dXJuIHBhcnRcbiAgICB9KVxuXG4gIHJldHVybiAoIXEudW5jZXJ0YWluLnZhbHVlICYmICFxLmFwcHJveGltYXRlLnZhbHVlKSA/XG4gICAgcmVqZWN0IDoge1xuICAgICAgLi4uZGF0ZSh2YWx1ZXMsIDIpLFxuICAgICAgdW5jZXJ0YWluOiBxLnVuY2VydGFpbi52YWx1ZSxcbiAgICAgIGFwcHJveGltYXRlOiBxLmFwcHJveGltYXRlLnZhbHVlXG4gICAgfVxufVxuIiwiaW1wb3J0IGFzc2VydCBmcm9tICcuL2Fzc2VydC5qcydcbmltcG9ydCB7IEV4dERhdGVUaW1lIH0gZnJvbSAnLi9pbnRlcmZhY2UuanMnXG5pbXBvcnQgeyBwYWQgfSBmcm9tICcuL2RhdGUuanMnXG5cbmNvbnN0IHsgYWJzIH0gPSBNYXRoXG5cbmNvbnN0IFYgPSBuZXcgV2Vha01hcCgpXG5jb25zdCBTID0gbmV3IFdlYWtNYXAoKVxuXG5leHBvcnQgY2xhc3MgWWVhciBleHRlbmRzIEV4dERhdGVUaW1lIHtcbiAgY29uc3RydWN0b3IoaW5wdXQpIHtcbiAgICBzdXBlcigpXG5cbiAgICBWLnNldCh0aGlzLCBbXSlcblxuICAgIHN3aXRjaCAodHlwZW9mIGlucHV0KSB7XG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgIHRoaXMueWVhciA9IGlucHV0XG4gICAgICBicmVha1xuXG4gICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgIGlucHV0ID0gWWVhci5wYXJzZShpbnB1dClcblxuICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1mYWxsdGhyb3VnaFxuICAgIGNhc2UgJ29iamVjdCc6XG4gICAgICBpZiAoQXJyYXkuaXNBcnJheShpbnB1dCkpXG4gICAgICAgIGlucHV0ID0geyB2YWx1ZXM6IGlucHV0IH1cblxuICAgICAge1xuICAgICAgICBhc3NlcnQoaW5wdXQgIT09IG51bGwpXG4gICAgICAgIGlmIChpbnB1dC50eXBlKSBhc3NlcnQuZXF1YWwoJ1llYXInLCBpbnB1dC50eXBlKVxuXG4gICAgICAgIGFzc2VydChpbnB1dC52YWx1ZXMpXG4gICAgICAgIGFzc2VydChpbnB1dC52YWx1ZXMubGVuZ3RoKVxuXG4gICAgICAgIHRoaXMueWVhciA9IGlucHV0LnZhbHVlc1swXVxuICAgICAgICB0aGlzLnNpZ25pZmljYW50ID0gaW5wdXQuc2lnbmlmaWNhbnRcbiAgICAgIH1cbiAgICAgIGJyZWFrXG5cbiAgICBjYXNlICd1bmRlZmluZWQnOlxuICAgICAgdGhpcy55ZWFyID0gbmV3IERhdGUoKS5nZXRVVENGdWxsWWVhcigpXG4gICAgICBicmVha1xuXG4gICAgZGVmYXVsdDpcbiAgICAgIHRocm93IG5ldyBSYW5nZUVycm9yKCdJbnZhbGlkIHllYXIgdmFsdWUnKVxuICAgIH1cbiAgfVxuXG4gIGdldCB5ZWFyKCkge1xuICAgIHJldHVybiB0aGlzLnZhbHVlc1swXVxuICB9XG5cbiAgc2V0IHllYXIoeWVhcikge1xuICAgIHRoaXMudmFsdWVzWzBdID0gTnVtYmVyKHllYXIpXG4gIH1cblxuICBnZXQgc2lnbmlmaWNhbnQoKSB7XG4gICAgcmV0dXJuIFMuZ2V0KHRoaXMpXG4gIH1cblxuICBzZXQgc2lnbmlmaWNhbnQoZGlnaXRzKSB7XG4gICAgUy5zZXQodGhpcywgTnVtYmVyKGRpZ2l0cykpXG4gIH1cblxuICBnZXQgdmFsdWVzKCkge1xuICAgIHJldHVybiBWLmdldCh0aGlzKVxuICB9XG5cbiAgZ2V0IG1pbigpIHtcbiAgICByZXR1cm4gRXh0RGF0ZVRpbWUuVVRDKHRoaXMueWVhciwgMClcbiAgfVxuXG4gIGdldCBtYXgoKSB7XG4gICAgcmV0dXJuIEV4dERhdGVUaW1lLlVUQyh0aGlzLnllYXIgKyAxLCAwKSAtIDFcbiAgfVxuXG4gIHRvRURURigpIHtcbiAgICBsZXQgeSA9IGFicyh0aGlzLnllYXIpXG4gICAgbGV0IHMgPSB0aGlzLnNpZ25pZmljYW50ID8gYFMke3RoaXMuc2lnbmlmaWNhbnR9YCA6ICcnXG5cbiAgICBpZiAoeSA8PSA5OTk5KSByZXR1cm4gYCR7dGhpcy55ZWFyIDwgMCA/ICctJyA6ICcnfSR7cGFkKHRoaXMueWVhcil9JHtzfWBcblxuICAgIC8vIFRPRE8gZXhwb25lbnRpYWwgZm9ybSBmb3IgZW5kaW5nIHplcm9lc1xuXG4gICAgcmV0dXJuIGBZJHt0aGlzLnllYXJ9JHtzfWBcbiAgfVxufVxuIiwiLy8gVGhlIG1vZHVsZSBjYWNoZVxudmFyIF9fd2VicGFja19tb2R1bGVfY2FjaGVfXyA9IHt9O1xuXG4vLyBUaGUgcmVxdWlyZSBmdW5jdGlvblxuZnVuY3Rpb24gX193ZWJwYWNrX3JlcXVpcmVfXyhtb2R1bGVJZCkge1xuXHQvLyBDaGVjayBpZiBtb2R1bGUgaXMgaW4gY2FjaGVcblx0dmFyIGNhY2hlZE1vZHVsZSA9IF9fd2VicGFja19tb2R1bGVfY2FjaGVfX1ttb2R1bGVJZF07XG5cdGlmIChjYWNoZWRNb2R1bGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiBjYWNoZWRNb2R1bGUuZXhwb3J0cztcblx0fVxuXHQvLyBDcmVhdGUgYSBuZXcgbW9kdWxlIChhbmQgcHV0IGl0IGludG8gdGhlIGNhY2hlKVxuXHR2YXIgbW9kdWxlID0gX193ZWJwYWNrX21vZHVsZV9jYWNoZV9fW21vZHVsZUlkXSA9IHtcblx0XHQvLyBubyBtb2R1bGUuaWQgbmVlZGVkXG5cdFx0Ly8gbm8gbW9kdWxlLmxvYWRlZCBuZWVkZWRcblx0XHRleHBvcnRzOiB7fVxuXHR9O1xuXG5cdC8vIEV4ZWN1dGUgdGhlIG1vZHVsZSBmdW5jdGlvblxuXHRfX3dlYnBhY2tfbW9kdWxlc19fW21vZHVsZUlkXS5jYWxsKG1vZHVsZS5leHBvcnRzLCBtb2R1bGUsIG1vZHVsZS5leHBvcnRzLCBfX3dlYnBhY2tfcmVxdWlyZV9fKTtcblxuXHQvLyBSZXR1cm4gdGhlIGV4cG9ydHMgb2YgdGhlIG1vZHVsZVxuXHRyZXR1cm4gbW9kdWxlLmV4cG9ydHM7XG59XG5cbiIsIi8vIGdldERlZmF1bHRFeHBvcnQgZnVuY3Rpb24gZm9yIGNvbXBhdGliaWxpdHkgd2l0aCBub24taGFybW9ueSBtb2R1bGVzXG5fX3dlYnBhY2tfcmVxdWlyZV9fLm4gPSAobW9kdWxlKSA9PiB7XG5cdHZhciBnZXR0ZXIgPSBtb2R1bGUgJiYgbW9kdWxlLl9fZXNNb2R1bGUgP1xuXHRcdCgpID0+IChtb2R1bGVbJ2RlZmF1bHQnXSkgOlxuXHRcdCgpID0+IChtb2R1bGUpO1xuXHRfX3dlYnBhY2tfcmVxdWlyZV9fLmQoZ2V0dGVyLCB7IGE6IGdldHRlciB9KTtcblx0cmV0dXJuIGdldHRlcjtcbn07IiwiLy8gZGVmaW5lIGdldHRlciBmdW5jdGlvbnMgZm9yIGhhcm1vbnkgZXhwb3J0c1xuX193ZWJwYWNrX3JlcXVpcmVfXy5kID0gKGV4cG9ydHMsIGRlZmluaXRpb24pID0+IHtcblx0Zm9yKHZhciBrZXkgaW4gZGVmaW5pdGlvbikge1xuXHRcdGlmKF9fd2VicGFja19yZXF1aXJlX18ubyhkZWZpbml0aW9uLCBrZXkpICYmICFfX3dlYnBhY2tfcmVxdWlyZV9fLm8oZXhwb3J0cywga2V5KSkge1xuXHRcdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIGtleSwgeyBlbnVtZXJhYmxlOiB0cnVlLCBnZXQ6IGRlZmluaXRpb25ba2V5XSB9KTtcblx0XHR9XG5cdH1cbn07IiwiX193ZWJwYWNrX3JlcXVpcmVfXy5vID0gKG9iaiwgcHJvcCkgPT4gKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmosIHByb3ApKSIsIi8vIGRlZmluZSBfX2VzTW9kdWxlIG9uIGV4cG9ydHNcbl9fd2VicGFja19yZXF1aXJlX18uciA9IChleHBvcnRzKSA9PiB7XG5cdGlmKHR5cGVvZiBTeW1ib2wgIT09ICd1bmRlZmluZWQnICYmIFN5bWJvbC50b1N0cmluZ1RhZykge1xuXHRcdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBTeW1ib2wudG9TdHJpbmdUYWcsIHsgdmFsdWU6ICdNb2R1bGUnIH0pO1xuXHR9XG5cdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCAnX19lc01vZHVsZScsIHsgdmFsdWU6IHRydWUgfSk7XG59OyIsIi8vIFBhdGg6IGJ1aWxkL2h0bWwvbW9kdWxlcy9FZHRmRGF0YVR5cGUvYXNzZXQvc3JjL2luZGV4LmpzXG5cbmltcG9ydCB7IHBhcnNlIH0gZnJvbSAnZWR0Zic7XG5pbXBvcnQgJCBmcm9tICdqcXVlcnknO1xuXG4vLyBhZGQgbGlzdGVuZXIgdG8gdGhlICNlZHRmLXZhbHVlIGlucHV0IGZvciBjaGFuZ2VzXG5cbmNvbnN0IHBhcnNlciA9IGZ1bmN0aW9uKGNvbnRhaW5lcikge1xuXG4gICAgdmFyIG91dHB1dFN0cmluZyA9IFwiXCJcbiAgICB2YXIgc2hvcnRFeHBsYW5hdGlvbiA9IFwiXCI7XG4gICAgdmFyIGNhcmV0TG9jYXRpb24sIGNhcmV0T2Zmc2V0ID0gMDtcblxuICAgIHRyeSB7XG4gICAgICAgIHBhcnNlKGNvbnRhaW5lci52YWx1ZSk7XG4gICAgICAgICQoY29udGFpbmVyKS5jbG9zZXN0KCcuZWR0ZicpLmZpbmQoJy5pbnZhbGlkLXZhbHVlJykuZW1wdHkoKTtcbiAgICAgICAgY29uc3QgdmFsaWRTdHJpbmcgPSBcbiAgICAgICAgXCI8ZGl2IGNsYXNzPSd2YWxpZC1zdHJpbmctY29udGFpbmVyJz5cIiArXG4gICAgICAgICAgICAgXCI8c3BhbiBjbGFzcz0nby1pY29uLWVkaXQgaWNvbicgdGl0bGU9J0NvcnJlY3QgdmFsdWUnIGFyaWEtbGFiZWw9J2FjY2VwdGVkIHZhbHVlJz48L3NwYW4+XCIrXG4gICAgICAgICAgICAgXCI8c3BhbiBjbGFzcz0ndmFsdWVzdWdnZXN0LWlkJz5cIiArIGNvbnRhaW5lci52YWx1ZSArIFwiPC9zcGFuPlwiICtcbiAgICAgICAgIFwiPC9kaXY+XCI7XG4gICAgICAgIHZhciB2YWxpZFN0cmluZ0NvbnRhaW5lciA9ICQoY29udGFpbmVyKS5jbG9zZXN0KFwiLmVkdGZcIikuZmluZChcIi52YWxpZC1zdHJpbmctY29udGFpbmVyXCIpO1xuICAgICAgICBcbiAgICAgICAgaWYodmFsaWRTdHJpbmdDb250YWluZXIubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgJCh2YWxpZFN0cmluZ0NvbnRhaW5lcikucmVwbGFjZVdpdGgodmFsaWRTdHJpbmcpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICQoY29udGFpbmVyKS5jbG9zZXN0KFwiLmVkdGZcIikucHJlcGVuZCh2YWxpZFN0cmluZyk7XG4gICAgICAgIH1cbiAgICAgICAgb3V0cHV0U3RyaW5nLCBzaG9ydEV4cGxhbmF0aW9uID0gXCJcIjtcblxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgXG4gICAgICAgIHZhciBtZXNzYWdlID0gU3RyaW5nKGUubWVzc2FnZSlcblxuICAgICAgICBjb25zdCBsaW5lcyA9IG1lc3NhZ2Uuc3BsaXQoJ1xcbicpO1xuICAgICAgICBsaW5lcy5mb3JFYWNoKChsaW5lLGkpID0+IHtcbiAgICAgICAgICAgIHN3aXRjaCAodHJ1ZSkge1xuICAgICAgICAgICAgICAgIGNhc2UgL1VuZXhwZWN0ZWQvLnRlc3QobGluZSk6XG4gICAgICAgICAgICAgICAgICAgIHNob3J0RXhwbGFuYXRpb24gPSBsaW5lLnN1YnN0cmluZygwLCBsaW5lLmluZGV4T2YoXCIuXCIpKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAvU3ludGF4Ly50ZXN0KGxpbmUpOlxuICAgICAgICAgICAgICAgICAgICAvL2NvbnNvbGUubG9nKFwiLS0gXCIgKyBsaW5lc1tpKzJdKTtcbiAgICAgICAgICAgICAgICAgICAgLy8gZ2V0IHRoZSBjb25zaXN0ZW50bHkgc2Vjb25kIGxpbmUgYWZ0ZXIgdGhlIHN5bnRheCBlcnJvciBsaW5lXG4gICAgICAgICAgICAgICAgICAgIC8vIG9ubHkgdGFrZSB0aGUgc2VjdGlvbiBhZnRlciB0aGUgc3BhY2VcbiAgICAgICAgICAgICAgICAgICAgb3V0cHV0U3RyaW5nID0gbGluZXNbaSsyXS5zcGxpdChcIiBcIilbMV07XG4gICAgICAgICAgICAgICAgICAgIGNhcmV0T2Zmc2V0ID0gbGluZXNbaSsyXS5zcGxpdChcIiBcIilbMF0ubGVuZ3RoICsgMTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAvXFxeLy50ZXN0KGxpbmUpOlxuICAgICAgICAgICAgICAgICAgICAvL2NvbnNvbGUubG9nKFwiLS0gXCIgKyBsaW5lKTtcbiAgICAgICAgICAgICAgICAgICAgLy8gY291bnQgdGhlIGNoYXJhdGVycyBpbiB0aGUgc3RyaW5nIGJlZm9yZSB0aGUgY2FyZXQgYWNjb3VudGluZyBmb3IgdGhlIHNwYWNlcyB0aGF0IGFyZSByZW1vdmVkXG4gICAgICAgICAgICAgICAgICAgIGNhcmV0TG9jYXRpb24gPSBsaW5lLmluZGV4T2YoXCJeXCIpIC0gY2FyZXRPZmZzZXQ7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrICAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgIC8vY29uc29sZS5sb2coXCItLSBcIiArIGxpbmUgKyBcIlxcblwiKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSlcblxuICAgICAgICAvLyBAdG9kbyBpZiB0aGVyZSBpcyBhIG1hdGNoLi4uIG91dHB1dCB0aGUgaHVtYW4gcmVhZGFibGUgdG8gdGhlIHNjcmVlbiEgU29tZXRoaW5nIGxpa2UgdmFsdWVzdWdnZXN0OlxuXG4gICAgICAgIGlmIChvdXRwdXRTdHJpbmcubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgb3V0cHV0U3RyaW5nID0gXCI8ZGl2PjxwIGNsYXNzPSdvdXRwdXRzdHJpbmcnPlwiICsgXG4gICAgICAgICAgICAgICAgb3V0cHV0U3RyaW5nLnN1YnN0cmluZygwLCBjYXJldExvY2F0aW9uICkgK1xuICAgICAgICAgICAgICAgIFwiPHNwYW4gY2xhc3M9J2NhcmV0Jz5cIiArICBvdXRwdXRTdHJpbmcuc3Vic3RyaW5nKGNhcmV0TG9jYXRpb24sIGNhcmV0TG9jYXRpb24gKyAxKSArIFwiPC9zcGFuPlwiICtcbiAgICAgICAgICAgICAgICBvdXRwdXRTdHJpbmcuc3Vic3RyaW5nKGNhcmV0TG9jYXRpb24gKyAxKSArIFxuICAgICAgICAgICAgICAgIFwiIFtcIiArIHNob3J0RXhwbGFuYXRpb24gKyBcIl1cIiArXG4gICAgICAgICAgICAgICAgXCI8L3A+PC9kaXY+XCI7XG4gICAgICAgIH1cblxuICAgICAgICAkKGNvbnRhaW5lcikuY2xvc2VzdCgnLmVkdGYnKS5maW5kKCcuaW52YWxpZC12YWx1ZScpLmh0bWwob3V0cHV0U3RyaW5nKTtcbiAgICAgICAgJChjb250YWluZXIpLmNsb3Nlc3QoJy5lZHRmJykuZmluZCgnLnZhbGlkLXN0cmluZy1jb250YWluZXInKS5yZW1vdmUoKTtcbiAgICB9XG59XG5cbmNvbnN0IGFkZFBhcnNlckV2ZW50TGlzdGVuZXIgPSBmdW5jdGlvbihjb250YWluZXIpIHtcblxuICAgIC8vIHRha2UgdGhlIGZpcnN0IGNvbnRhaW5lciBpbiB0aGUgYXJyYXlcbiAgICAkKGNvbnRhaW5lcilbMF0uYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCBmdW5jdGlvbihlKVxuICAgIHsgICBcbiAgICAgICAgcGFyc2VyKGUudGFyZ2V0KVxuICAgIH0pO1xuXG59XG5cbmNvbnN0IGxpc3RlbiA9IGZ1bmN0aW9uKCkge1xuICAgIC8vIHNldHVwIGZvciBmdXR1cmUgbmV3IGluc3RhbmNlc1xuICAgICQoZG9jdW1lbnQpLm9uKCdvOnByZXBhcmUtdmFsdWUgbzpwcmVwYXJlLXZhbHVlLWFubm90YXRpb24nLCBmdW5jdGlvbihlLCB0eXBlLCBjb250YWluZXIpIHtcbiAgICAgICAgaWYgKCdlZHRmOmRhdGUnID09PSB0eXBlKSB7XG4gICAgICAgICAgICB2YXIgaW5wdXQgPSBjb250YWluZXIuZmluZCgnLmVkdGYtdmFsdWUnKTtcbiAgICAgICAgICAgIGFkZFBhcnNlckV2ZW50TGlzdGVuZXIoY29udGFpbmVyKTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgdmFyIGlucHV0cyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5lZHRmIGlucHV0LmVkdGYtdmFsdWUnKTtcblxuICAgIFxuICAgIGlucHV0cy5mb3JFYWNoKGlucHV0ID0+IHtcbiAgICAgICAgcGFyc2VyKGlucHV0KVxuICAgICAgICBhZGRQYXJzZXJFdmVudExpc3RlbmVyKGlucHV0KVxuICAgIH0pO1xuXG59XG5cbmV4cG9ydCB7IFxuICAgIGxpc3RlbiBcbn07Il0sIm5hbWVzIjpbXSwic291cmNlUm9vdCI6IiJ9