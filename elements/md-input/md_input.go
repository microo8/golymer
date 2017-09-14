package mdinput

import "github.com/microo8/golymer"

var mdInputTemplate = golymer.NewTemplate(`
<style>
:host {
	display: block;
    position: relative;
	margin-bottom: 30px;
}

input {
    border: none;
    border-bottom: 1px solid #757575;
    display: block;
    font-size: 18px;
    padding: 10px 10px 10px 5px;
	width: 100%;
	box-sizing: border-box;
}

input:focus {
    outline: none;
}

/* LABEL ======================================= */
label {
    color: #999;
    font-size: 18px;
    font-weight: normal;
    left: 5px;
    pointer-events: none;
    position: absolute;
    top: 10px;
    transition: 0.2s ease all;
}

/* active state */
input:focus ~ label,
input:valid ~ label {
    color: var(--secondary-color, #5264AE);
    font-size: 14px;
    top: -15px;
}

/* BOTTOM BARS ================================= */
.bar {
    display: block;
    position: relative;
	width: 100%;
}

.bar:after,
.bar:before {
    background: var(--secondary-color, #5264AE);
    bottom: 1px;
    content: "";
    height: 2px;
    position: absolute;
    transition: 0.2s ease all;
    width: 0;
}

.bar:before {
    left: 50%;
}

.bar:after {
    right: 50%;
}

/* active state */
input:focus ~ .bar:after,
input:focus ~ .bar:before {
    width: 50%;
}

/* HIGHLIGHTER ================================== */
.highlight {
    height: 60%;
    left: 0;
    opacity: 0.5;
    pointer-events: none;
    position: absolute;
    top: 25%;
}

/* active state */
input:focus ~ .highlight {
    animation: inputHighlighter 0.3s ease;
}

/* ANIMATIONS ================ */
@keyframes inputHighlighter {
    from {
        background: var(--secondary-color, #5264AE);
    }

    to {
        background: transparent;
        width: 0;
    }
}
</style>
<input type="text" value="{{Value}}" required>
<span class="highlight"></span>
<span class="bar"></span>
<label>[[Label]]</label>
`)

//MdInput is an simple implementation of the material design text input
type MdInput struct {
	golymer.Element
	Label string
	Value string
}

func newMdInput() *MdInput {
	mdi := new(MdInput)
	mdi.SetTemplate(mdInputTemplate)
	return mdi
}

func init() {
	err := golymer.Define(newMdInput)
	if err != nil {
		panic(err)
	}
}
