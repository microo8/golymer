package main

import (
	"github.com/microo8/golymer"
	"github.com/microo8/golymer/elements/md-app-bar"
	_ "github.com/microo8/golymer/elements/md-icon"
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
<md-icon img="menu" slot="nav-icon"></md-icon>
<md-icon img="more_vert" slot="icons"></md-icon>
<md-icon img="search" slot="icons"></md-icon>
<md-icon img="favorite" slot="icons"></md-icon>
</md-app-bar>
`)

//MdAppBarTest testing element for the md-app-bar
type MdAppBarTest struct {
	golymer.Element
	appbar *mdappbar.MdAppBar
}

func newMdAppBarTest() *MdAppBarTest {
	lt := new(MdAppBarTest)
	lt.SetTemplate(mdAppBarTemplate)
	return lt
}

func init() {
	err := golymer.Define(newMdAppBarTest)
	if err != nil {
		panic(err)
	}
}
