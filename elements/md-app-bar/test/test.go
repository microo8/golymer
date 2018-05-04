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
	display: block;
	contain: content;
	margin: 0;
    position: relative;
	width: 100vw;
	height: 100vh;
}
</style>
<md-app-bar id="appbar" title="md app bar title">
<md-icon img="menu" slot="nav-icon" on-click="OpenNavDrawer"></md-icon>
<md-icon img="more_vert" slot="icons"></md-icon>
<md-icon img="search" slot="icons"></md-icon>
<md-icon img="favorite" slot="icons"></md-icon>
</md-app-bar>
<md-nav-drawer id="nav"></md-nav-drawer>
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
