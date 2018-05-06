package mditem

import (
	"github.com/microo8/golymer"
	_ "github.com/microo8/golymer/elements/md-icon"
)

var mdItemTemplate = golymer.NewTemplate(`
<style>
@keyframes ce-ripple {
  0%   { transform: scale(0); }
  20%  { transform: scale(1); }
  100% { opacity: 0; transform: scale(2); }
}
:host {
  display: block;
  contain: content;
  cursor: pointer;
  color: var(--theme-text-color-900, #212121); 
  background-color: var(--theme-color-0, #fff);
}
:host([icon=""]) {
	padding-left: 40px;
}
:host([icon=""]) md-icon {
	visibility: hidden;
}
:host([disabled]),
:host([disabled]) md-icon,
:host([disabled]) md-input {
  color: var(--theme-text-color-500, #9e9e9e);
  pointer-events: none;
  cursor: none;
}
:host{
  line-height: 24px;
  font-size: 14px;
  padding: 8px 16px;
}
:host(:hover) {
	opacity: 0.4;
}
:host(:active) {
  background-color: var(--theme-color-50, #fafafa);
}
:host .md-subheader {
  color: var(--theme-text-color-500, #9e9e9e);
}
:host md-icon {
  padding-right: 32px;
  color: var(--theme-text-color-500, #9e9e9e);
  vertical-align: middle;
}
</style>
<md-icon id="icon" img="[[Icon]]"></md-icon>
<slot></slot>
`)

//MdItem is an material design item used in navigation drawer
type MdItem struct {
	golymer.Element
	Icon     string
	Active   bool
	Disanled bool
}

func newMdItem() *MdItem {
	l := new(MdItem)
	l.SetTemplate(mdItemTemplate)
	return l
}

func init() {
	golymer.MustDefine(newMdItem)
}
