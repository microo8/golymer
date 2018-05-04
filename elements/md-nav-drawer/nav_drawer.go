package mdnavdrawer

import (
	"github.com/gopherjs/gopherjs/js"
	"github.com/microo8/golymer"
)

var mdNavDrawerTemplate = golymer.NewTemplate(`
<style>
:host {
  display: block;
  text-transform: capitalize;
}
:host([visible]) {
  visibility: visible;
}
:host(:not([visible])) {
  visibility: hidden;
}
:host span {
  position: absolute;
  background-color: #000;
  left: 0;
  right: 0;
  bottom: 0;
  opacity: .5;
  top: 0;
  z-index: 13;
}
:host div {
  background-color: var(--theme-color-0, #ffffff);
  box-shadow: var(--theme-shadow-3dp, 0   3px  6px rgba(0,0,0,0.18), 0  3px  6px rgba(0,0,0,0.23) );
  color: var(--theme-text-color-900, #212121);
  display: block;
  height: 100%; 
  left: 0;
  max-width: 320px;
  overflow: auto;
  position: absolute;
  top: 0;
  width: calc(100vw - var(--theme-height-app-bar, 56px));
  z-index: 16;
}
:host div .md-top-header {
  margin: 0; 
  height: var(--theme-height-app-bar, 56px);
  line-height: 56px;
  padding: 0 18px;
  background-color: var(--theme-color-600, #757575);
  color: var(--theme-text-color-0, #ffffff);
}
:host div .md-top-header * {
  vertical-align: middle;
}
:host div .md-title {
  padding: 8px 16px;
}
:host([visible]) div {
  left: 0;
  transform: translateX(0);
  transition: var(--theme-animation-in, all .3s ease-in);
}
:host(:not([visible])) div {
  left: -241px;
  transform: translateX(0);
  transition: var(--theme-animation-out, all .2s ease-out);
}
:host div hr {
  display: block;
  margin: 4px 0px;
  height: 1px;
  border: 1px solid #ccc;
  border-width: 0 0 1px 0;
}
</style>
<div><slot></slot></div><span id="blocker"></span>
`)

//MdNavDrawer is an material design navigation drawer
type MdNavDrawer struct {
	golymer.Element
	Visible bool
	blocker *js.Object
}

func newMdNavDrawer() *MdNavDrawer {
	l := new(MdNavDrawer)
	l.SetTemplate(mdNavDrawerTemplate)
	return l
}

//ConnectedCallback ...
func (nd *MdNavDrawer) ConnectedCallback() {
	nd.Element.ConnectedCallback()
	nd.blocker.Call("addEventListener", "click", func() { nd.Visible = !nd.Visible })
}

var mdNavItemTemplate = golymer.NewTemplate(`
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

//MdNavItem is an material design item used in navigation drawer
type MdNavItem struct {
	golymer.Element
	Icon     string
	Active   bool
	Disanled bool
}

func newMdNavItem() *MdNavItem {
	l := new(MdNavItem)
	l.SetTemplate(mdNavItemTemplate)
	return l
}

func init() {
	golymer.MustDefine(newMdNavDrawer)
	golymer.MustDefine(newMdNavItem)
}
