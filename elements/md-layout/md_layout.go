package mdlayout

import (
	"github.com/microo8/golymer"
)

var mdLayoutTemplate = golymer.NewTemplate(`
<style>
:host {
	display: block;
	contain: content;
	margin: 0;
    position: relative;
	width: 100vw;
	height: 100vh;
}

:host([drawer-opened]) .drawer {
	transform: translateX(0);
}

:host([drawer-opened]) .drawer_bg {
	visibility: visible;
	opacity: 1;
}

.header {
    height: 56px;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    width: 100%;
    z-index: 3;
    box-shadow: 0 3px 6px -3px rgba(0, 0, 0, 0.5);
}
.drawer_bg {
    position: fixed;
    background: rgba(0, 0, 0, 0.5);
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100vw;
    height: 100vh;
    z-index: 4;
    opacity: 0.001;
    visibility: hidden;
	transition: all 0.3s;
}

.drawer {
	height: 100%;
	position: relative;
	overflow-y: auto;
    max-width: 320px;
    width: 75%;
    height: 100%;
    left: 0px;
    top: 0;
    bottom: 0;
    transform: translateX(-100%);
    background: white;
    position: fixed;
    z-index: 5;
	transition: all 0.3s;
}

.header ::slotted(*) {
	margin: 0;
}
</style>
<div class="drawer_bg" id="bg" on-click="HideBG"></div>
<div class="header" id="header">
	<slot name="header"></slot>
</div>
<div class="container">
	<slot name="content"></slot>
</div>
<div class="drawer" id="drawer">
	<slot name="drawer"></slot>
</div>
`)

//MdLayout is an material design application layout element, with header, navigation drawer and footer
type MdLayout struct {
	golymer.Element
	DrawerOpened bool
}

func newMdLayout() *MdLayout {
	l := new(MdLayout)
	l.SetTemplate(mdLayoutTemplate)
	return l
}

func (l *MdLayout) HideBG(event *golymer.Event) {
	l.DrawerOpened = false
}

func init() {
	err := golymer.Define(newMdLayout)
	if err != nil {
		panic(err)
	}
}
