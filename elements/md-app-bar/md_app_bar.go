package mdappbar

import (
	"github.com/microo8/golymer"
)

var mdAppBarTemplate = golymer.NewTemplate(`
<style>
@keyframes md-ripple {
  0%   { transform: scale(0); }
  20%  { transform: scale(1); }
  100% { opacity: 0; transform: scale(2); }
}

:host {
  position: absolute;
  background-color: var(--theme-color-600, #757575);
  box-shadow: var(--theme-shadow-4dp, 0   4px  8px rgba(0,0,0,0.18), 0  4px  8px rgba(0,0,0,0.23));
  color: var(--theme-text-color-0, #ffffff);
  display: block;
  left: 0;
  min-height: var(--theme-height-app-bar, 56px);
  top: 0;
  width: 100%;
  z-index: 4;
}
:host ::slotted([slot=nav-icon]) {
  float: left;
  position: relative;
  margin: 16px;
  display: inline-block;
  vertical-align: middle;
}
:host ::slotted([slot=icons]) {
  float: right;
  position: relative;
  margin: 16px;
  display: inline-block;
  vertical-align: middle;
}
:host > div {
  display: inline-block;
  line-height: var(--theme-height-app-bar, 56px);
  font-size: var(--theme-title-font-size, 20px);
  font-weight: var(--theme-title-font-weight, 500);
  margin-left: 16px;
  margin: 0;
  text-transform: capitalize;
}
:host ::slotted([slot=icons]):after {
  content: '';
  display: block;
  position: absolute;
  width: 56px;
  height: 56px;
  margin-left: -18px;
  margin-top: -40px;
  background: #3f51b5;
  border-radius: 100%;
  opacity: .6;
  transform: scale(0);
}

:host ::slotted([slot=icons]):active:after {
  animation: md-ripple .4s ease-out;
}
</style>
<slot name="nav-icon"></slot>
<div>[[Title]]</div>
<slot name="icons"></slot>
`)

//MdAppBar is an material design application bar element
type MdAppBar struct {
	golymer.Element
	Title string
}

func newMdAppBar() *MdAppBar {
	l := new(MdAppBar)
	l.SetTemplate(mdAppBarTemplate)
	return l
}

func init() {
	golymer.MustDefine(newMdAppBar)
}
