package main

import (
	"github.com/microo8/golymer"
	_ "github.com/microo8/golymer/elements/md-icon"
	mdnavdrawer "github.com/microo8/golymer/elements/md-nav-drawer"
)

func main() {}

var mdNavDrawerTestTemplate = golymer.NewTemplate(`
<style>
:host {
	--theme-color-500: coral;
	--theme-color-200: coral;
	--theme-color-50: black;
	--theme-color-0: white;
	display: block;
	contain: content;
	margin: 0;
    position: relative;
	width: 100vw;
	height: 100vh;
	background-color: gray;
}
</style>
<md-icon img="menu" on-click="OpenNavDrawer"></md-icon>
<md-nav-drawer id="nav" visible>
<md-nav-item icon="account_circle">account</md-nav-item>
<md-nav-item icon="explore">explore</md-nav-item>
<md-nav-item>meh</md-nav-item>
<md-nav-item disabled>diabled meh</md-nav-item>
<hr/>
<md-nav-item icon="exit_to_app">exit</md-nav-item>
</md-nav-drawer>
`)

//MdNavDrawerTest testing element for the md-app-bar
type MdNavDrawerTest struct {
	golymer.Element
	nav *mdnavdrawer.MdNavDrawer
}

//OpenNavDrawer ...
func (ndt *MdNavDrawerTest) OpenNavDrawer(event golymer.Event) {
	ndt.nav.Visible = !ndt.nav.Visible
}

func newMdNavDrawerTest() *MdNavDrawerTest {
	lt := new(MdNavDrawerTest)
	lt.SetTemplate(mdNavDrawerTestTemplate)
	return lt
}

func init() {
	golymer.MustDefine(newMdNavDrawerTest)
}
