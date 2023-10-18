<?php
namespace EdtfDataType\View\Helper;

use Laminas\Form\View\Helper\AbstractHelper;
use Laminas\Form\ElementInterface;

class ConvertToEdtf extends AbstractHelper
{
    public function __invoke(ElementInterface $element)
    {
        return $this->render($element);
    }

    public function render(ElementInterface $element)
    {
        echo("ConvertToEdtf.php: render() called\n");
        $view = $this->getView();
        return sprintf(
            '%s%s',
            $view->formText($element->getPropertyElement()),
            $view->formText($element->getTypeElement())
        );
    }
}
