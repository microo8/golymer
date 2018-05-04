package main

import (
	"github.com/microo8/golymer"
	"github.com/microo8/golymer/elements/md-app-bar"
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
<img src="ic_menu_white_24px.svg" slot="nav-icon"/>
<img src="ic_more_vert_white_24px.svg" slot="icons"/>
<img src="ic_search_white_24px.svg" slot="icons"/>
<img src="ic_favorite_white_24px.svg" slot="icons"/>
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
