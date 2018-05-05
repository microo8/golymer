package main

import (
	"github.com/microo8/golymer"
	"github.com/microo8/golymer/elements/md-app-bar"
	_ "github.com/microo8/golymer/elements/md-icon"
	_ "github.com/microo8/golymer/elements/md-item"
	mdmenu "github.com/microo8/golymer/elements/md-menu"
	mdnavdrawer "github.com/microo8/golymer/elements/md-nav-drawer"
)

func main() {}

var mdAppBarTemplate = golymer.NewTemplate(`
<style>
:host {
	--theme-color-600: coral;
	--theme-color-500: coral;
	--theme-color-200: coral;
	--theme-text-color-900: #eee;
	--theme-color-0: #444;
	display: block;
	contain: content;
	margin: 0;
    position: relative;
	width: 100vw;
	height: 100vh;
	background-color: var(--theme-color-0, #444);
}
</style>

<md-app-bar id="appbar" title="md app bar title">
  <md-icon img="menu" slot="nav-icon" on-click="OpenNavDrawer"></md-icon>
  <md-icon img="more_vert" slot="icons" on-click="OpenMenu"></md-icon>
  <md-icon img="search" slot="icons"></md-icon>
  <md-icon img="favorite" slot="icons"></md-icon>
</md-app-bar>

<md-menu id="menu">
  <md-item icon="favorite">favorite</md-item>
  <md-item icon="home">home</md-item>
  <br/>
  <md-item>close</md-item>
</md-menu>

<md-nav-drawer id="nav">
  <md-item icon="account_circle">account</md-item>
  <md-item icon="explore">explore</md-item>
  <md-item>meh</md-item>
  <md-item disabled>diabled meh</md-item>
  <hr/>
  <md-item icon="exit_to_app">exit</md-item>
</md-nav-drawer>

`)

//MdAppBarTest testing element for the md-app-bar
type MdAppBarTest struct {
	golymer.Element
	appbar *mdappbar.MdAppBar
	nav    *mdnavdrawer.MdNavDrawer
	menu   *mdmenu.MdMenu
}

func newMdAppBarTest() *MdAppBarTest {
	lt := new(MdAppBarTest)
	lt.SetTemplate(mdAppBarTemplate)
	return lt
}

//OpenNavDrawer ...
func (abt *MdAppBarTest) OpenNavDrawer(event *golymer.Event) {
	abt.nav.Visible = true
}

//OpenMenu ...
func (abt *MdAppBarTest) OpenMenu(event *golymer.Event) {
	println(event.Target)
	abt.menu.Issuer = event.Target
	abt.menu.Visible = true
}

func init() {
	err := golymer.Define(newMdAppBarTest)
	if err != nil {
		panic(err)
	}
}
