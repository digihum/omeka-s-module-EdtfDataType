<?php
namespace EdtfDataType\Form\Element;

use Laminas\Form\Element;

class Edtf extends Element
{
    protected $valueElement;

    public function __construct($name = null, $options = [])
    {
        parent::__construct($name, $options);

        $this->valueElement = (new Element\Text($name))
                  ->setAttribute('class', 'edtf-value to-require');
    }

    public function getValueElement()
    {
        $this->valueElement->setValue($this->getValue());
        return $this->valueElement;
    }


}
