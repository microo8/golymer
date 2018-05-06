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
}
:host([visible]) {
  visibility: visible;
  animation-name: open;
  animation-duration: 195ms;
  animation-timing-function: ease-in;
  animation-fill-mode: forwards;
}
@keyframes open {
	0% {
		transform-origin: top center;
		transform: scaleY(0.1);
		opacity: 0.1;
	}
	100% {
		transform-origin: top center;
		transform: scaleY(1);
		opacity: 1;
	}
}
:host([visible]) ::slotted(*) {
  animation-name: fadein;
  animation-duration: 195ms;
  animation-timing-function: ease-in;
  animation-fill-mode: forwards;
}
@keyframes fadein {
	0% {
		opacity: 0;
	}
	100% {
		opacity: 1;
	}
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
	children := m.Get("children")
	for i := 1; i < children.Length(); i++ {
		children.Index(i).Get("style").Set("animationDelay", strconv.Itoa(50*i)+"ms")
	}
}

//ObserverVisible on openning the menu it closes all other menus
func (m *MdMenu) ObserverVisible(old, new bool) {
	if !new {
		return
	}
	if m.Issuer != nil {
		bw := js.Global.Get("window").Get("innerWidth").Int()
		bh := js.Global.Get("window").Get("innerHeight").Int()
		mRect := m.Call("getBoundingClientRect")
		mw, mh := mRect.Get("width").Int(), mRect.Get("height").Int()
		rect := m.Issuer.Call("getBoundingClientRect")
		if rect.Get("top").Int()+mh < bh {
			m.Get("style").Set("top", rect.Get("top").String()+"px")
		} else {
			top := strconv.Itoa(rect.Get("bottom").Int() - mh)
			m.Get("style").Set("top", top+"px")
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
