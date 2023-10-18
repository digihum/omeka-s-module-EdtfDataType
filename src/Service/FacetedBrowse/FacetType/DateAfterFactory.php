<?php
namespace EdtfDataType\Service\FacetedBrowse\FacetType;

use EdtfDataType\FacetedBrowse\FacetType\DateAfter;
use Laminas\ServiceManager\Factory\FactoryInterface;
use Interop\Container\ContainerInterface;

class DateAfterFactory implements FactoryInterface
{
    public function __invoke(ContainerInterface $services, $requestedName, array $options = null)
    {
        return new DateAfter($services->get('FormElementManager'));
    }
}
