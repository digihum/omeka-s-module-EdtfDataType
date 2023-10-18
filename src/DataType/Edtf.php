<?php
namespace EdtfDataType\DataType;

use Doctrine\ORM\QueryBuilder;
use EdtfDataType\Entity\EdtfDataType;
use EdtfDataType\Form\Element\Edtf as EdtfElement;
use Omeka\Api\Adapter\AbstractEntityAdapter;
use Omeka\Api\Adapter\AdapterInterface;
use Omeka\Api\Representation\ValueRepresentation;
use Omeka\DataType\ValueAnnotatingInterface;
use Omeka\Entity\Value;
use Laminas\View\Renderer\PhpRenderer;
use \EDTF\EdtfFactory;

class Edtf extends AbstractDateTimeDataType implements ValueAnnotatingInterface
{
    public function getName()
    {
        return 'edtf';
    }

    public function getLabel()
    {
        return 'EDTF Date/Time'; // @translate
    }

    public function getJsonLd(ValueRepresentation $value)
    {
        # @todo this is relevant work that needs to be done for EDTF
        if (!$this->isValid(['@value' => $value->value()])) {
            return ['@value' => $value->value()];
        }
        $date = $this->getDateTimeFromValue($value->value());
        $type = null;
        if (isset($date['month']) && isset($date['day']) && isset($date['hour']) && isset($date['minute']) && isset($date['second']) && isset($date['offset_value'])) {
            $type = 'http://www.w3.org/2001/XMLSchema#dateTime';
        } elseif (isset($date['month']) && isset($date['day']) && isset($date['hour']) && isset($date['minute']) && isset($date['offset_value'])) {
            $type = 'http://www.w3.org/2001/XMLSchema#dateTime';
        } elseif (isset($date['month']) && isset($date['day']) && isset($date['hour']) && isset($date['offset_value'])) {
            $type = 'http://www.w3.org/2001/XMLSchema#dateTime';
        } elseif (isset($date['month']) && isset($date['day']) && isset($date['hour']) && isset($date['minute']) && isset($date['second'])) {
            $type = 'http://www.w3.org/2001/XMLSchema#dateTime';
        } elseif (isset($date['month']) && isset($date['day']) && isset($date['hour']) && isset($date['minute'])) {
            $type = null; // XSD has no datatype for truncated seconds
        } elseif (isset($date['month']) && isset($date['day']) && isset($date['hour'])) {
            $type = null; // XSD has no datatype for truncated minutes/seconds
        } elseif (isset($date['month']) && isset($date['day'])) {
            $type = 'http://www.w3.org/2001/XMLSchema#date';
        } elseif (isset($date['month'])) {
            $type = 'http://www.w3.org/2001/XMLSchema#gYearMonth';
        } else {
            $type = 'http://www.w3.org/2001/XMLSchema#gYear';
        }
        $jsonLd = ['@value' => $value->value()];
        if ($type) {
            $jsonLd['@type'] = $type;
        }
        return $jsonLd;
    }

    public function form(PhpRenderer $view)
    {
        $element = new EdtfElement('edtf-value');
        $element->getValueElement()->setAttribute('data-value-key', '@value');
        return $view->formElement($element);
    }

    public function isValid(array $valueObject)
    {
        #echo("is this working? ");
        #print_r($this->getDateTimeFromValue($valueObject["@value"]));
        
        # Use the parsing library to validate the EDTF date.
        $parser = \EDTF\EdtfFactory::newParser();
        $parsingResult = $parser->parse($valueObject['@value']);

        if($parsingResult->isValid()!=1) {
            return false;
        }
        return true;
    }

    public function hydrate(array $valueObject, Value $value, AbstractEntityAdapter $adapter)
    {
        // Store the datetime in ISO 8601, allowing for reduced accuracy.
        $date = $this->getDateTimeFromValue($valueObject['@value']);
        $value->setValue($date['date']->format($date['format_iso8601']));
        $value->setLang(null);
        $value->setUri(null);
        $value->setValueResource(null);
    }

    public function render(PhpRenderer $view, ValueRepresentation $value, $options = [])
    {
        if (!$this->isValid(['@value' => $value->value()])) {
            return $value->value();
        }
        $options['lang'] ??= $view->lang();
        return $this->getFormattedDateTimeFromValue($value->value(), $options);
    }

    public function getFulltextText(PhpRenderer $view, ValueRepresentation $value)
    {
        return sprintf('%s %s', $value->value(), $this->render($view, $value));
    }

    public function getEntityClass()
    {
        return 'EdtfDataType\Entity\EdtfDataType';
    }

    public function setEntityValues(EdtfDataType $entity, Value $value)
    {
        $date = $this->getDateTimeFromValue($value->getValue());
        $entity->setValue($date['date']->getEdtf());
    }

    /**
     * numeric => [
     *   ts => [
     *     lt/lte => [val => <date>, pid => <propertyID>],
     *     gt/gte => [val => <date>, pid => <propertyID>],
     *   ],
     * ]
     */
    public function buildQuery(AdapterInterface $adapter, QueryBuilder $qb, array $query)
    {
        if (isset($query['numeric']['ts']['lt']['val'])) {
            $value = $query['numeric']['ts']['lt']['val'];
            $propertyId = $query['numeric']['ts']['lt']['pid'] ?? null;
            if ($this->isValid(['@value' => $value])) {
                $date = $this->getDateTimeFromValue($value);
                $number = $date['date']->getEdtf();
                $this->addLessThanQuery($adapter, $qb, $propertyId, $number);
            }
        }
        if (isset($query['numeric']['ts']['gt']['val'])) {
            $value = $query['numeric']['ts']['gt']['val'];
            $propertyId = $query['numeric']['ts']['gt']['pid'] ?? null;
            if ($this->isValid(['@value' => $value])) {
                $date = $this->getDateTimeFromValue($value);
                $number = $date['date']->getEdtf();
                $this->addGreaterThanQuery($adapter, $qb, $propertyId, $number);
            }
        }
        if (isset($query['numeric']['ts']['lte']['val'])) {
            $value = $query['numeric']['ts']['lte']['val'];
            $propertyId = $query['numeric']['ts']['lte']['pid'] ?? null;
            if ($this->isValid(['@value' => $value])) {
                $date = $this->getDateTimeFromValue($value);
                $number = $date['date']->getEdtf();
                $this->addLessThanOrEqualToQuery($adapter, $qb, $propertyId, $number);
            }
        }
        if (isset($query['numeric']['ts']['gte']['val'])) {
            $value = $query['numeric']['ts']['gte']['val'];
            $propertyId = $query['numeric']['ts']['gte']['pid'] ?? null;
            if ($this->isValid(['@value' => $value])) {
                $date = $this->getDateTimeFromValue($value);
                $number = $date['date']->getEdtf();
                $this->addGreaterThanOrEqualToQuery($adapter, $qb, $propertyId, $number);
            }
        }
    }

    public function sortQuery(AdapterInterface $adapter, QueryBuilder $qb, array $query, $type, $propertyId)
    {
        if ('edtf' === $type) {
            $alias = $adapter->createAlias();
            $qb->addSelect("MIN($alias.value) as HIDDEN edtf_value");
            $qb->leftJoin(
                $this->getEntityClass(), $alias, 'WITH',
                $qb->expr()->andX(
                    $qb->expr()->eq("$alias.resource", 'omeka_root.id'),
                    $qb->expr()->eq("$alias.property", $propertyId)
                )
            );
            $qb->addOrderBy('edtf_value', $query['sort_order']);
        }
    }

    public function valueAnnotationPrepareForm(PhpRenderer $view)
    {
    }

    public function valueAnnotationForm(PhpRenderer $view)
    {
        return $this->form($view);
    }
}
