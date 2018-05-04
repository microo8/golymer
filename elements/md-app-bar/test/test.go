package main

import (
	"github.com/microo8/golymer"
	"github.com/microo8/golymer/elements/md-app-bar"
	_ "github.com/microo8/golymer/elements/md-icon"
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
  <md-icon img="more_vert" slot="icons"></md-icon>
  <md-icon img="search" slot="icons"></md-icon>
  <md-icon img="favorite" slot="icons"></md-icon>
</md-app-bar>

<md-nav-drawer id="nav">
  <md-nav-item icon="account_circle">account</md-nav-item>
  <md-nav-item icon="explore">explore</md-nav-item>
  <md-nav-item>meh</md-nav-item>
  <md-nav-item disabled>diabled meh</md-nav-item>
  <hr/>
  <md-nav-item icon="exit_to_app">exit</md-nav-item>
</md-nav-drawer>

`)

//MdAppBarTest testing element for the md-app-bar
type MdAppBarTest struct {
	golymer.Element
	appbar *mdappbar.MdAppBar
	nav    *mdnavdrawer.MdNavDrawer
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

func init() {
	err := golymer.Define(newMdAppBarTest)
	if err != nil {
		panic(err)
	}
}
