<?php
namespace EdtfDataType\Service\FacetedBrowse\FacetType;

use EdtfDataType\FacetedBrowse\FacetType\DurationGreaterThan;
use Laminas\ServiceManager\Factory\FactoryInterface;
use Interop\Container\ContainerInterface;

class DurationGreaterThanFactory implements FactoryInterface
{
    public function __invoke(ContainerInterface $services, $requestedName, array $options = null)
    {
        return new DurationGreaterThan($services->get('FormElementManager'));
    }
}
