package mdmenu

import (
	"strconv"
	"time"

	"github.com/gopherjs/gopherjs/js"
	"github.com/microo8/golymer"
)

var mdMenuTemplate = golymer.NewTemplate(`
<style>
:host {
  display: block;
  background-color: var(--theme-color-0, #ffffff);
  box-shadow: var(--theme-shadow-1dp,  0   1px  3px rgba(0,0,0,0.12), 0  1px  2px rgba(0,0,0,0.24));
  color: var(--theme-text-color-900, #212121);
  font-size: 16px;
  overflow-y: auto;
  padding: 8px 0px;
  position: absolute;
  min-width: 200px;
  z-index: 8;
}
:host(:not([visible])) {
  visibility: hidden;
  transform-origin: 0px 0px 0px;
}
:host([visible]) {
  display: block;
  transform-origin: 0px 0px 0px;
  transform: scaleY(1);
  visibility: visible;
}
:host hr {
  display: block;
  margin: 4px 0px;
  height: 1px;
  border: 1px solid #ccc;
  border-width: 0 0 1px 0;
}
:host md-item {
  user-select: none;
  line-height: 32px;
  padding: 8px 16px;
  font-size: 16px;
  display: block;
  min-width: 160px;
}
:host md-item img {
  height: 16px;
}
:host md-item:hover {
  background-color: var(--theme-color-200, #eeeeee);
}
:host md-item:active {
  background-color: var(--theme-color-50, #fafafa);
}
:host md-item md-icon {
  vertical-align: middle;
  padding: 0 8px 0 0;
}
</style>
<slot></slot>
`)

//MdMenu is an material design menu
type MdMenu struct {
	golymer.Element
	Visible bool
	//if set to an node, menu will be opened beneath it
	Issuer    *js.Object
	justShown bool
}

//ConnectedCallback ...
func (m *MdMenu) ConnectedCallback() {
	m.Element.ConnectedCallback()
	js.Global.Get("document").Call("addEventListener", "click", m.close)
}

//ObserverVisible on openning the menu it closes all other menus
func (m *MdMenu) ObserverVisible(old, new bool) {
	if !new {
		return
	}
	if m.Issuer != nil {
		bw, bh := getWidthHeight(js.Global.Get("document").Get("body"))
		mw, mh := getWidthHeight(m.Element.Object)
		rect := m.Issuer.Call("getBoundingClientRect")
		if rect.Get("bottom").Int()+mh < bh {
			m.Get("style").Set("top", rect.Get("bottom").String()+"px")
		} else {
			m.Get("style").Set("bottom", rect.Get("top").String()+"px")
		}
		if rect.Get("left").Int()+mw < bw {
			m.Get("style").Set("left", rect.Get("left").String()+"px")
		} else {
			left := strconv.Itoa(rect.Get("right").Int() - mw)
			m.Get("style").Set("left", left+"px")
		}
	}
	m.justShown = true
	go func() {
		time.Sleep(200 * time.Millisecond)
		m.justShown = false
	}()
}

func (m *MdMenu) close(event *golymer.Event) {
	if !m.justShown && !m.Call("contains", event.Target).Bool() {
		m.Visible = false
	}
}

func newMdMenu() *MdMenu {
	l := new(MdMenu)
	l.SetTemplate(mdMenuTemplate)
	return l
}

func init() {
	golymer.MustDefine(newMdMenu)
}

func getWidthHeight(o *js.Object) (int, int) {
	rect := o.Call("getBoundingClientRect")
	return rect.Get("width").Int(), rect.Get("height").Int()
}
