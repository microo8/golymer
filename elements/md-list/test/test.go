package main

import (
	"github.com/microo8/golymer"
	_ "github.com/microo8/golymer/elements/md-item"
	mdlist "github.com/microo8/golymer/elements/md-list"
)

func main() {}

var mdListTemplate = golymer.NewTemplate(`
<md-list>
  <md-item icon="home">home</md-item>
  <md-item icon="home">home</md-item>
  <md-item icon="home">home</md-item>
  <md-item icon="home">home</md-item>
  <md-item icon="home">home</md-item>
  <md-item icon="home">home</md-item>
  <md-item icon="home">home</md-item>
  <md-item icon="home">home</md-item>
  <md-item icon="home">home</md-item>
</md-list>
`)

//MdListTest testing element for the md-app-bar
type MdListTest struct {
	golymer.Element
	list *mdlist.MdList
}

func newMdListTest() *MdListTest {
	lt := new(MdListTest)
	lt.SetTemplate(mdListTemplate)
	return lt
}

func init() {
	golymer.MustDefine(newMdListTest)
}
