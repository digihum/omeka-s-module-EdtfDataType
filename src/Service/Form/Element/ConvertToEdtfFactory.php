<?php
namespace EdtfDataType\Service\Form\Element;

use Interop\Container\ContainerInterface;
use EdtfDataType\Form\Element\ConvertToEdtf;
use Laminas\ServiceManager\Factory\FactoryInterface;

class ConvertToEdtfFactory implements FactoryInterface
{
    public function __invoke(ContainerInterface $services, $requestedName, array $options = null)
    {
        $element = new ConvertToEdtf;
        $element->setFormElementManager($services->get('FormElementManager'));
        return $element;
    }
}
