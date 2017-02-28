"use strict";

const

    O = require ('es7-object-polyfill'),
      
    colorCodes = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', '', 'default'],
    styleCodes = ['', 'bright', 'dim', 'italic', 'underline', '', '', 'inverse'],

    brightCssColors = { black: [ 32,  32,  32],
                          red: [200,   0,   0],
                        green: [0,   160,   0],
                       yellow: [204, 190,   0],
                         blue: [ 50,   0, 207],
                      magenta: [170,  13, 145],
                         cyan: [  9, 173, 185],
                        white: [255, 255, 255] },

    cssColors = { black: [  0,   0,   0],
                    red: [196,  26,  22],
                  green: [  0, 116,   0],
                 yellow: [179, 167,   0],
                   blue: [ 28,   0, 207],
                magenta: [136,  18, 128],
                   cyan: [  7, 144, 154],
                  white: [230, 230, 230]    },

    types = {   0:  'style',
                2:  'unstyle',
                3:  'color',
                4:  'bgColor',
                10: 'bgColorBright' },

    subtypes = {    color:         colorCodes,
                    bgColor:       colorCodes,
                    bgColorBright: colorCodes,
                    style:         styleCodes,
                    unstyle:       styleCodes    }

class Color {

    constructor (background, name, brightness) {

        this.background = background
        this.name       = name
        this.brightness = brightness
    }

    get inverse () {
        return new Color (!this.background, this.name || (this.background ? 'black' : 'white'), this.brightness) }

    css (inverted, brightness_) {

        const color = inverted ? this.inverse : this

        const brightness = color.brightness || brightness_

        const prop = (color.background ? 'background:' : 'color:'),
              rgb  = ((brightness === Code.bright) ? brightCssColors : cssColors)[color.name]

        return rgb ? (prop + 'rgba(' + [...rgb, (brightness === Code.dim) ? 0.5 : 1].join (',') + ');') : (brightness === Code.dim ? 'color:rgba(0,0,0,0.5);text-shadow:rgba(255,255,255,0.5) 0 0;' : '');
    }
}

class Code {

    constructor (n) {
        if (n !== undefined) { this.value = Number (n) } }

    get type () {
       return types[Math.floor (this.value / 10)] }

    get subtype () {
        return (subtypes[this.type] || [])[this.value % 10] }

    get str () {
        return (this.value ? ('\u001b\[' + this.value + 'm') : '') }

    static str (x) {
        return new Code (x).str }

    get isBrightness () {
        return (this.value === Code.noBrightness) || (this.value === Code.bright) || (this.value === Code.dim) }
}

O.assign (Code, {

    bright:       1,
    dim:          2,
    inverse:      7,
    noBrightness: 22,
    noItalic:     23,
    noUnderline:  24,
    noInverse:    27,
    noColor:      39,
    noBgColor:    49
})

const camel = (a, b) => a + b.charAt (0).toUpperCase () + b.slice (1)

class Colors {

    constructor (s) {

        if (s) {

            const r = /\u001b\[(\d+)m/g

            const spans = s.split (/\u001b\[\d+m/)
            const codes = []

            for (let match; match = r.exec (s);) codes.push (match[1])

            this.spans = spans.map ((s, i) => ({ text: s, code: new Code (codes[i]) })) 
        }

        else {
            this.spans = []
        }
    }

    get str () {
        return this.spans.reduce ((str, p) => str + p.text + (p.code ? p.code.str : ''), '') }

    get styledWithCSS () {

        var color      = new Color (),
            bgColor    = new Color (true /* background */),
            brightness = undefined,
            styles     = new Set ()

        return O.assign (new Colors (), {

            spans: this.spans.map (p => { const c = p.code

                const inverted  = styles.has ('inverse'),
                      underline = styles.has ('underline')   ? 'font-style: underline;' : '',                      
                      italic    = styles.has ('italic')      ? 'text-decoration: italic;' : '',
                      bold      = brightness === Code.bright ? 'font-weight: bold;' : ''

                const styledPart = O.assign ({ css: bold + italic + underline +
                                                        color  .css (inverted, brightness) +
                                                        bgColor.css (inverted) }, p)
                if (c.isBrightness) {
                    brightness = c.value }

                else {

                    switch (p.code.type) {

                        case 'color'        : color   = new Color (false, c.subtype);              break
                        case 'bgColor'      : bgColor = new Color (true,  c.subtype);              break
                        case 'bgColorBright': bgColor = new Color (true,  c.subtype, Code.bright); break

                        case 'style'  : styles.add    (c.subtype); break
                        case 'unstyle': styles.delete (c.subtype); break } }

                return styledPart

            }).filter (s => s.text.length > 0)
        })
    }

/*  Outputs with WebInspector-compatible format     */

    get browserConsoleArguments () {

        const spans = this.styledWithCSS.spans

        return [spans.map (p => ('%c' + p.text)).join (''),
             ...spans.map (p => p.css)]
    }

/*  Installs unsafe String extensions   */

    static get nice () {

        const def = k => O.defineProperty (String.prototype, k,  { get: function () { return Colors[k] (this) } })

        colorCodes.forEach ((k, i) => {
            if (!(k in String.prototype)) {
                [                   k,
                 camel ('bg',       k),
                 camel ('bgBright', k)].forEach (def) } })

        styleCodes.forEach ((k, i) => { if (!(k in String.prototype)) def (k) })

        return Colors
    }

/*  Parsing front-end   */

    static parse (s) {
        return new Colors (s).styledWithCSS
    }

/*  Iteration protocol  */

    [Symbol.iterator] () {
        return this.spans[Symbol.iterator] ()
    }
}

const replaceAll = (str, a, b) => str.split (a).join (b)

/*  ANSI brightness codes do not overlap, e.g. "{bright}{dim}foo" will be rendered bright (not dim).
    So we fix it by adding brightness canceling before each brightness code, so the former example gets
    converted to "{noBrightness}{bright}{noBrightness}{dim}foo" – this way it gets rendered as expected.
 */

const denormalizeBrightness = s => s.replace (/(\u001b\[(1|2)m)/g, '\u001b[22m$1')
const normalizeBrightness = s => s.replace (/\u001b\[22m(\u001b\[(1|2)m)/g, '$1')

const wrap = (open, close) => {

    open  = Code.str (open)
    close = Code.str (close)

    return s => denormalizeBrightness (open + replaceAll (normalizeBrightness (s), close, open) + close)
}

colorCodes.forEach ((k, i) => {
    if (k) {
        Colors[k]                     = wrap (30  + i, Code.noColor)
        Colors[camel ('bg',       k)] = wrap (40  + i, Code.noBgColor)
        Colors[camel ('bgBright', k)] = wrap (100 + i, Code.noBgColor) } })

styleCodes.forEach ((k, i) => {
    if (k) {
        Colors[k] = wrap (i, ((k === 'bright') || (k === 'dim')) ? Code.noBrightness : (20 + i)) } })

module.exports = Colors
