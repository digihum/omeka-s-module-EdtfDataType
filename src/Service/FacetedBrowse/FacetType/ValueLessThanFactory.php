<?php
namespace EdtfDataType\Service\FacetedBrowse\FacetType;

use EdtfDataType\FacetedBrowse\FacetType\ValueLessThan;
use Laminas\ServiceManager\Factory\FactoryInterface;
use Interop\Container\ContainerInterface;

class ValueLessThanFactory implements FactoryInterface
{
    public function __invoke(ContainerInterface $services, $requestedName, array $options = null)
    {
        return new ValueLessThan($services->get('FormElementManager'));
    }
}
