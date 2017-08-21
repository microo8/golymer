package mdbutton

import "github.com/microo8/golymer"

func init() {
	err := golymer.Define(NewMdButton)
	if err != nil {
		panic(err)
	}
}

const mdButtonTemplate = `
<style>
  :host {
	@apply --layout-inline;
	@apply --layout-center-center;
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
  }
  :host([elevation="1"]) {
	@apply --paper-material-elevation-1;
  }
  :host([elevation="2"]) {
	@apply --paper-material-elevation-2;
  }
  :host([elevation="3"]) {
	@apply --paper-material-elevation-3;
  }
  :host([elevation="4"]) {
	@apply --paper-material-elevation-4;
  }
  :host([elevation="5"]) {
	@apply --paper-material-elevation-5;
  }
  :host([hidden]) {
	display: none !important;
  }
  :host([raised].keyboard-focus) {
	font-weight: bold;
	@apply --md-button-raised-keyboard-focus;
  }
  :host(:not([raised]).keyboard-focus) {
	font-weight: bold;
	@apply --md-button-flat-keyboard-focus;
  }
  :host([disabled]) {
	background: #eaeaea;
	color: #a8a8a8;
	cursor: auto;
	pointer-events: none;
	@apply --md-button-disabled;
  }
  :host([animated]) {
	@apply --shadow-transition;
  }
  paper-ripple {
	color: var(--md-button-ink-color);
  }
</style>

<slot></slot>
`

//MdButton implementation of material design button
type MdButton struct {
	golymer.Element
	Raised bool
}

//NewMdButton creates new MDButton
func NewMdButton() *MdButton {
	b := new(MdButton)
	b.Template = mdButtonTemplate
	return b
}
