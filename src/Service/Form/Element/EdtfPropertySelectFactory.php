<?php
namespace EdtfDataType\Service\Form\Element;

use Interop\Container\ContainerInterface;
use EdtfDataType\Form\Element\EdtfPropertySelect;
use Laminas\ServiceManager\Factory\FactoryInterface;

class EdtfPropertySelectFactory implements FactoryInterface
{
    public function __invoke(ContainerInterface $services, $requestedName, array $options = null)
    {
        $element = new EdtfPropertySelect;
        $element->setEntityManager($services->get('Omeka\EntityManager'));
        return $element;
    }
}
