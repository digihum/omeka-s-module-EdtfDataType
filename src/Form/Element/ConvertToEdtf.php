<?php
namespace EdtfDataType\Form\Element;

use Omeka\Form\Element\PropertySelect;
use Laminas\Form\Element;
use Laminas\ServiceManager\ServiceLocatorInterface;

class ConvertToEdtf extends Element
{
    protected $formElements;
    protected $propertyElement;
    protected $typeElement;

    public function setFormElementManager(ServiceLocatorInterface  $formElements)
    {
        $this->formElements = $formElements;
    }

    public function init()
    {
        $this->setAttribute('data-collection-action', 'replace');
        $this->setLabel('Convert to EDTF'); // @translate
        $this->propertyElement = $this->formElements->get(PropertySelect::class)
            ->setName('edtf_convert[property]')
            ->setEmptyOption('Select property') // @translate
            ->setAttributes([
                'class' => 'chosen-select',
                'data-placeholder' => 'Select property', // @translate
            ]);
        $this->typeElement = (new Element\Select('edtf_convert[type]'))
            ->setEmptyOption('[No change]') // @translate
            ->setValueOptions([
                'edtf' => 'Convert to EDTF', // @translate
            ]);
    }

    public function getPropertyElement()
    {
        return $this->propertyElement;
    }

    public function getTypeElement()
    {
        return $this->typeElement;
    }
}
