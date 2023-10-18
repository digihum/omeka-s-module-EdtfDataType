<?php
namespace EdtfDataType\Service\Delegator;

use Interop\Container\ContainerInterface;
use Laminas\ServiceManager\Factory\DelegatorFactoryInterface;

class FormElementDelegatorFactory implements DelegatorFactoryInterface
{
    public function __invoke(ContainerInterface $container, $name,
        callable $callback, array $options = null
    ) {
        $formElement = $callback();
        $formElement->addClass(
            \EdtfDataType\Form\Element\Edtf::class,
            'formEdtf'
        );
        $formElement->addClass(
            \EdtfDataType\Form\Element\ConvertToEdtf::class,
            'formEdtfConvertToEdtf'
        );
        return $formElement;
    }
}
