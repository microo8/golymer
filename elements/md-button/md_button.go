package mdbutton

import (
	"github.com/microo8/golymer"
)

func init() {
	err := golymer.Define(NewMdButton)
	if err != nil {
		panic(err)
	}
}

var mdButtonTemplate = golymer.NewTemplate(`
<style>
  :host {
	display: inline-flex;
	align-items: center;
	position: relative;
	box-sizing: border-box;
	min-width: 5.14em;
	margin: 0 0.29em;
	background: transparent;
	-webkit-tap-highlight-color: rgba(0, 0, 0, 0);
	-webkit-tap-highlight-color: transparent;
	font: inherit;
	text-transform: uppercase;
	outline-width: 0;
	border-radius: 3px;
	-moz-user-select: none;
	-ms-user-select: none;
	-webkit-user-select: none;
	user-select: none;
	cursor: pointer;
	z-index: 0;
	padding: 0.7em 0.57em;
	transition: box-shadow 0.28s cubic-bezier(0.4, 0, 0.2, 1);
  }
  :host([Elevation="1"]) {
	box-shadow: 0 2px 2px 0 rgba(0, 0, 0, 0.14),
                    0 1px 5px 0 rgba(0, 0, 0, 0.12),
                    0 3px 1px -2px rgba(0, 0, 0, 0.2);
  }
  :host([Elevation="2"]) {
	box-shadow: 0 3px 4px 0 rgba(0, 0, 0, 0.14),
				0 1px 8px 0 rgba(0, 0, 0, 0.12),
				0 3px 3px -2px rgba(0, 0, 0, 0.4);
  }
  :host([Elevation="3"]) {
	box-shadow: 0 4px 5px 0 rgba(0, 0, 0, 0.14),
				0 1px 10px 0 rgba(0, 0, 0, 0.12),
				0 2px 4px -1px rgba(0, 0, 0, 0.4);
  }
  :host([Elevation="4"]) {
	box-shadow: 0 6px 10px 0 rgba(0, 0, 0, 0.14),
				0 1px 18px 0 rgba(0, 0, 0, 0.12),
				0 3px 5px -1px rgba(0, 0, 0, 0.4);
  }
  :host([Elevation="5"]) {
	box-shadow: 0 12px 16px 1px rgba(0, 0, 0, 0.14),
				0 4px 22px 3px rgba(0, 0, 0, 0.12),
				0 6px 7px -4px rgba(0, 0, 0, 0.4);
  }
  :host([Hidden]) {
	display: none !important;
  }
  :host([Raised].keyboard-focus) {
	font-weight: bold;
	@apply --md-button-raised-keyboard-focus;
  }
  :host(:not([Raised]).keyboard-focus) {
	font-weight: bold;
	@apply --md-button-flat-keyboard-focus;
  }
  :host([Disabled]) {
	background: #eaeaea;
	color: #a8a8a8;
	cursor: auto;
	pointer-events: none;
	@apply --md-button-disabled;
  }
  paper-ripple {
	color: var(--md-button-ink-color);
  }
</style>

<slot></slot>
`)

//MdButton implementation of material design button
type MdButton struct {
	golymer.Element
	Raised    bool
	Disabled  bool
	Hidden    bool
	Elevation int
}

//NewMdButton creates new MDButton
func NewMdButton() *MdButton {
	b := new(MdButton)
	b.Elevation = 1
	b.SetTemplate(mdButtonTemplate)
	return b
}
