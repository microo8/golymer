package main

import (
	"github.com/microo8/golymer"
	_ "github.com/microo8/golymer/elements/md-icon"
	_ "github.com/microo8/golymer/elements/md-item"
	mdmenu "github.com/microo8/golymer/elements/md-menu"
)

func main() {}

var mdMenuTemplate = golymer.NewTemplate(`
<style>
:host {
	--theme-text-color-0: black;
}

#icon2 {
	float: right;
}
</style>
<md-icon img="more_vert" on-click="OpenMenu">open menu</md-icon>
<md-menu id="menu">
  <md-item icon="favorite">favorite</md-item>
  <md-item icon="home">home</md-item>
  <br/>
  <md-item>close</md-item>
</md-menu>

<md-icon id="icon2" img="more_vert" on-click="OpenMenu2">open menu</md-icon>
<md-menu id="menu2">
  <md-item icon="menu">menu</md-item>
  <md-item icon="home">home</md-item>
  <md-item icon="menu">menu</md-item>
  <md-item icon="menu">menu</md-item>
  <md-item icon="menu">menu</md-item>
  <md-item icon="menu">menu</md-item>
  <md-item icon="menu">menu</md-item>
  <md-item icon="home">home</md-item>
  <md-item icon="home">home</md-item>
  <md-item icon="home">home</md-item>
  <md-item icon="home">home</md-item>
  <md-item icon="home">home</md-item>
  <br/>
  <md-item>close</md-item>
</md-menu>
`)

//MdMenuTest testing element for the md-app-bar
type MdMenuTest struct {
	golymer.Element
	menu  *mdmenu.MdMenu
	menu2 *mdmenu.MdMenu
}

func newMdMenuTest() *MdMenuTest {
	lt := new(MdMenuTest)
	lt.SetTemplate(mdMenuTemplate)
	return lt
}

//OpenMenu ...
func (abt *MdMenuTest) OpenMenu(event *golymer.Event) {
	abt.menu.Issuer = event.Target
	abt.menu.Visible = true
}

//OpenMenu2 ...
func (abt *MdMenuTest) OpenMenu2(event *golymer.Event) {
	abt.menu2.Issuer = event.Target
	abt.menu2.Visible = true
}

func init() {
	golymer.MustDefine(newMdMenuTest)
}
